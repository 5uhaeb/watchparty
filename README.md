# WatchParty Starter

A simple full-stack watch party starter with:
- Next.js frontend
- Express + Socket.IO backend
- Janus AudioBridge room audio service
- MongoDB Atlas
- Anonymous guest identity
- Room creation, join, chat, and basic playback sync
- Redis-backed transient presence with a 60-second reconnect grace window

## Important note on streaming platforms
This starter supports:
- YouTube links
- local file playback metadata sync
- local file streaming with WebRTC, where the host's browser streams its local video playback directly to viewers
- anonymous guest identity with a signed httpOnly cookie

For Netflix, Prime Video, and Hotstar/JioHotstar, this project is designed for **sync only**. It does not capture or rebroadcast protected streams. Use the included browser extension so each participant can open the same subscribed title or IPL match in their own OTT tab while WatchParty syncs playback controls.

## Local file streaming

Hosts can choose **Stream local file** inside a room. The file stays on the host device: the backend only relays WebRTC SDP and ICE messages over Socket.IO, and no media bytes are uploaded to the server.

The browser must be able to decode the selected file before it can stream it. MP4/WebM/MOV are generally reliable in Chromium-based browsers; MKV/AVI support depends on the codecs inside the file and the browser/device.

For WebRTC networking, the frontend reads:

```env
NEXT_PUBLIC_STUN_URLS=stun:stun.l.google.com:19302
NEXT_PUBLIC_TURN_URL=
NEXT_PUBLIC_TURN_USER=
NEXT_PUBLIC_TURN_CRED=
```

Without TURN, local streaming can fail across stricter NATs or mobile networks. Set TURN credentials for cross-network rooms, such as a laptop on WiFi streaming to a phone on 4G.

## Room audio mixing

WatchParty uses Janus AudioBridge for room audio. The Janus config lives in `audio-server/`. On Render, the root `Dockerfile` runs the Node backend and Janus in the same web service, with nginx routing `/janus` to Janus internally.

The frontend requires the Janus WebSocket URL:

```env
NEXT_PUBLIC_AUDIO_SERVER_WS_URL=ws://localhost:8188/janus
```

For Render, set it to the deployed Janus audio service URL:

```env
NEXT_PUBLIC_AUDIO_SERVER_WS_URL=wss://your-render-backend-url/janus
```

If this value is missing or the Janus service is not running, camera video can still connect, but mixed room audio will not work.

## Project structure

```bash
watchparty-starter/
  apps/
    web/
    server/
  packages/
    shared/
```

## Run locally

### 1. Backend
```bash
cd apps/server
npm install
cp .env.example .env
npm run dev
```

### 2. Frontend
```bash
cd apps/web
npm install
cp .env.example .env.local
npm run dev
```

## Environment setup

### Backend `.env`
```env
PORT=5000
CLIENT_URL=http://localhost:3000
MONGODB_URI=your_mongodb_atlas_uri
REDIS_URL=redis://localhost:6379
GUEST_JWT_SECRET=replace_me
EXTENSION_TOKEN_SECRET=replace_me
```

`REDIS_URL` stores live room presence only. Presence is intentionally transient:
users are marked `reconnecting` on socket disconnect and are removed only after
60 seconds without returning, or immediately when they click Leave. Room presence
hashes/sets expire after 6 hours so a server crash does not leak records.

If `REDIS_URL` is unset outside production, the backend uses `ioredis-mock` so
local development still works. That mock is process-local, so presence resets on
server restart. With real Redis still running, clients rebuild presence as they
reconnect after a backend restart.

### Frontend `.env.local`
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
NEXT_PUBLIC_STUN_URLS=stun:stun.l.google.com:19302
NEXT_PUBLIC_TURN_URL=
NEXT_PUBLIC_TURN_USER=
NEXT_PUBLIC_TURN_CRED=
NEXT_PUBLIC_AUDIO_SERVER_WS_URL=ws://localhost:8188/janus
```

## Vercel + Render deployment
- Deploy `frontend/` to Vercel
- Deploy the root `render.yaml` Blueprint to Render
- Render creates one Docker web service named `watchparty`
- Point the frontend API/socket env vars to the Render backend URL
- Point `NEXT_PUBLIC_AUDIO_SERVER_WS_URL` to the same Render URL with `/janus`, for example `wss://watchparty-6a3e.onrender.com/janus`
- Allow CORS for the frontend URL in backend env

## What is included
- anonymous guest bootstrap
- dashboard
- create room page
- room join page
- chat
- simple playback state sync

## Next recommended upgrades
- host-only controls
- persistent chat storage
- YouTube iframe sync adapter
- browser extension hardening for more OTT player edge cases
- optional accounts

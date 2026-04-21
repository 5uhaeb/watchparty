# WatchParty Starter

A simple full-stack watch party starter with:
- Next.js frontend
- Express + Socket.IO backend
- MongoDB Atlas
- Google OAuth with NextAuth
- Room creation, join, chat, and basic playback sync

## Important note on streaming platforms
This starter supports:
- YouTube links
- local file playback metadata sync
- local file streaming with WebRTC, where the host's browser streams its local video playback directly to viewers

For Netflix, Prime Video, and Hotstar, this project is designed for **sync only**. It does not capture or rebroadcast protected streams. A browser extension is the practical next step for full remote-control sync on those sites.

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
JWT_SECRET=replace_me
```

### Frontend `.env.local`
```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace_me
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
NEXT_PUBLIC_STUN_URLS=stun:stun.l.google.com:19302
NEXT_PUBLIC_TURN_URL=
NEXT_PUBLIC_TURN_USER=
NEXT_PUBLIC_TURN_CRED=
```

## Vercel + Render deployment
- Deploy `apps/web` to Vercel
- Deploy `apps/server` to Render
- Point the frontend env vars to your Render backend URL
- Allow CORS for the frontend URL in backend env

## What is included
- Google login
- dashboard
- create room page
- room join page
- chat
- simple playback state sync

## Next recommended upgrades
- host-only controls
- persistent chat storage
- YouTube iframe sync adapter
- browser extension for OTT sync
- friends/invites

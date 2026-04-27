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
- HYPERION.EXE as an embedded local room game source
- anonymous guest identity with a signed httpOnly cookie

OTT/browser-extension sync is disabled. The current focus is the in-room video call, local streaming, and Janus room audio.

## Embedded games

Hosts/admins can choose **Hyperion** from the source picker to launch the bundled `HYPERION.EXE` side-scrolling shooter in the room player. The game is served from `frontend/public/games/hyperion/` and runs locally for each participant inside an iframe, so it does not require a third-party CDN at runtime. The original editable game package lives in `hyperion.io/`.

## Local file streaming

Hosts can choose **Stream local file** inside a room. The file stays on the host device: the backend only relays WebRTC SDP and ICE messages over Socket.IO, and no media bytes are uploaded to the server.

The browser must be able to decode the selected file before it can stream it. MP4/WebM/MOV are generally reliable in Chromium-based browsers; MKV/AVI support depends on the codecs inside the file and the browser/device.

For WebRTC networking, the frontend reads:

```env
NEXT_PUBLIC_STUN_URLS=stun:stun.l.google.com:19302
NEXT_PUBLIC_TURN_URLS=turn:your-turn-host:3478,turns:your-turn-host:5349?transport=tcp
NEXT_PUBLIC_TURN_USER=your_turn_username
NEXT_PUBLIC_TURN_CRED=your_turn_password
```

Without real TURN, local streaming and camera calls will often work only on the same WiFi network and fail across mobile data, different routers, CGNAT, school/office networks, or strict firewalls. Set TURN credentials in Vercel for cross-network rooms. `NEXT_PUBLIC_TURN_URLS` accepts comma-separated URLs, for example UDP and TCP/TLS relay URLs from the same provider. `NEXT_PUBLIC_TURN_USERNAME` / `NEXT_PUBLIC_TURN_PASSWORD` are also accepted aliases.

## Room audio mixing

WatchParty uses Janus AudioBridge for room audio. The Janus config lives in `audio-server/`. On Render, `render.yaml` deploys a separate `watchparty-janus-audio` Docker service and the frontend connects to the service WebSocket root. Janus uses `/janus` for HTTP transport, but not for WebSockets.

The frontend requires the Janus WebSocket URL:

```env
NEXT_PUBLIC_AUDIO_SERVER_WS_URL=ws://localhost:8188
```

For Render, set it to the deployed Janus audio service URL:

```env
NEXT_PUBLIC_AUDIO_SERVER_WS_URL=wss://your-janus-render-url
```

If this value is missing or the Janus service is not running, camera video can still connect, but mixed room audio will not work.

## Call & Sync Architecture

WatchParty uses raw WebRTC mesh calls plus Socket.IO signaling. Each participant owns one peer connection per remote socket, and each remote tile owns its own `<video>` element.

```text
Participant A camera/mic ─┐
                          ├─ RTCPeerConnection Map<peerSocketId, pc> ── Socket.IO call:signal ── peers
Participant B camera/mic ─┘

Host player time ── player:play/pause/seek/heartbeat { mediaTimeMs, wallClockMs } ── guests
Guests compute drift = host media time + wall-clock elapsed - local media time.
```

Sync is host-authoritative. The host broadcasts play, pause, seek, and 3-second heartbeat updates with media time and wall-clock time. Guests hard-seek for drift over 400 ms and gently correct smaller drift with playback-rate nudges. The call panel also exposes **Sync Now**: hosts broadcast their current state, while guests request the latest host state and seek locally.

Call mute keeps the outgoing audio sender alive and silences it with a gain node, which avoids tearing down the WebRTC audio track. Camera switching uses `RTCRtpSender.replaceTrack()` so flipping cameras does not renegotiate the call.

Manual test matrix for call and sync changes:

| Scenario | Expected result |
| --- | --- |
| 2 browser profiles join call | Each sees the other's remote video tile within 3 seconds. |
| 3 browser profiles join call | Every participant sees two remote tiles. |
| Late joiner enters active call | Existing peers negotiate to the late joiner within 3 seconds. |
| Peer leaves, then rejoins | Old tile is removed, new tile reconnects with a fresh peer connection. |
| Host play/pause/seek | Guests reflect the state within about 500 ms on healthy networks. |
| Guest presses Sync Now | Guest requests host state and seeks locally; toast says "Synced to host". |
| Host presses Sync Now | Host broadcasts current media state to the room. |
| Flip Camera with two cameras | Outgoing video changes without leaving or renegotiating the call. |
| Mute/unmute | Remote participants keep the audio track alive; muted sends silence. |
| Fullscreen modes 1/2/3 | Side, cinema, and overlay layouts switch with keyboard or segmented controls. |

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
NEXT_PUBLIC_TURN_URLS=turn:your-turn-host:3478,turns:your-turn-host:5349?transport=tcp
NEXT_PUBLIC_TURN_USER=your_turn_username
NEXT_PUBLIC_TURN_CRED=your_turn_password
NEXT_PUBLIC_AUDIO_SERVER_WS_URL=ws://localhost:8188
```

## Vercel + Render deployment
- Deploy `frontend/` to Vercel
- Deploy the root `render.yaml` Blueprint to Render
- Render creates the Node service named `watchparty` and the Janus service named `watchparty-janus-audio`
- Point the frontend API/socket env vars to the Render backend URL
- Point `NEXT_PUBLIC_AUDIO_SERVER_WS_URL` to the Janus service WebSocket URL without `/janus`, for example `wss://watchparty-janus-audio.onrender.com`
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
- optional accounts

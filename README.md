# WatchParty

Shared watch rooms with chat, playback synchronization and browser WebRTC calls. The frontend is Next.js; Express and Socket.IO manage guest identity, room state and signaling.

## What it does

- Creates shareable rooms with host/admin playback and source permissions.
- Supports YouTube, local playback and host-to-viewer local-file streaming.
- Relays WebRTC offers/answers and ICE candidates for camera calls and local streams.
- Keeps a 60-second reconnect grace period before removing a participant.
- Includes optional Janus mixed room audio, a standalone embedded game and an extension overlay.

OTT playback synchronization is disabled on the server. The extension code remains for the overlay; do not describe provider playback sync as working. Mesh calls and local streams are intended for small rooms.

## Architecture

```text
Next.js browser -> Express guest/room APIs -> MongoDB guests, rooms and messages
                -> Socket.IO rooms -> chat, playback state, SDP/ICE signaling
                -> WebRTC peers -> camera/local-file media
                -> optional Janus AudioBridge -> mixed room audio
```

Room creation records the owner guest ID and a random room code. Socket handshakes verify the signed guest identity; joining subscribes to the room and returns chat/playback state. Control events check server-side permissions. Call signals carry the server-authenticated sender ID and remain in the current room. Disconnects retain transient presence for 60 seconds; reconnect restores it, while expiry removes the participant and may transfer ownership.

STUN helps peers discover network addresses. TURN relays media when a direct connection cannot be established. The API relays local-stream signaling, not local-file bytes. Guest identity is anonymous; it is not a password/account system. Optional Janus rooms do not bind admission to the application guest token. Bootstrap returns a client bearer token as well as an HttpOnly cookie, so the token can reach browser code.

## Run locally

Use Node.js 22 and a local or Atlas MongoDB database.

```bash
npm ci
npm --prefix backend ci
npm --prefix frontend ci
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
npm --prefix backend run dev
```

In another terminal, run `npm --prefix frontend run dev` and open http://localhost:3000. On PowerShell, use `Copy-Item` instead of `cp` if preferred. Generate a server secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and place it only in the backend environment.

## Environment

| Location | Variables |
| --- | --- |
| Backend | `MONGODB_URI`, `GUEST_JWT_SECRET`, `CLIENT_URL` (comma-separated frontend origins), optional `PORT` |
| Frontend | `NEXT_PUBLIC_API_URL` ending `/api`, `NEXT_PUBLIC_SOCKET_URL` |
| Browser ICE | `NEXT_PUBLIC_STUN_URLS`, optional `NEXT_PUBLIC_TURN_URLS`, `NEXT_PUBLIC_TURN_USER`, `NEXT_PUBLIC_TURN_CRED` |
| Optional audio | `NEXT_PUBLIC_AUDIO_SERVER_WS_URL`, e.g. `ws://localhost:8188` |

Public frontend variables are embedded at build time. TURN credentials provided this way are visible to users; use scoped, short-lived credentials for a production relay. The client also accepts the existing username/password and single-URL aliases. No Redis environment is needed: presence is in memory.

Guest tokens expire after 24 hours and may renew the same guest within the 30-day identity lifetime. HTTP and WebSocket origins are checked, guest HMAC signatures are verified, and room control/data mutations enforce guest permissions. Room codes are shareable access, not a private-account membership scheme. Browser extensions remain accepted origins for the companion overlay.

## Verification

```bash
npm run test:unit
npm --prefix frontend run lint
npm --prefix frontend run build
npm run test:e2e:install
npm run test:e2e
```

Unit tests cover presence/reconnect, permissions, rate limits, guest signatures, malformed socket inputs and cross-room call protection. Playwright needs a disposable MongoDB instance; configure `MONGODB_URI` explicitly for testing. CI starts a MongoDB service. A passing frontend build or unit suite does not verify microphone/camera, real TURN connectivity, Janus mixing or extension/provider integration.

## Deployment

Deploy `frontend/` on Vercel as Next.js with its build-time variables. Deploy `backend/` on Render using `npm ci` and `npm start`, or use the root Dockerfile/blueprint for the backend. Set `NODE_ENV=production`, `CLIENT_URL`, `MONGODB_URI` and `GUEST_JWT_SECRET`; `/api/health` is process liveness. Use one backend instance until presence and Socket.IO state can be shared.

The separate Janus Docker service is optional. See [its setup](audio-server/README.md) for local ports and relay requirements: a reachable WebSocket does not prove media connectivity, especially on a host without exposed UDP ports. Janus WebSocket URLs use the service root, without `/janus`.

The editable game lives in `hyperion.io/` as HTML plus a local Phaser runtime. Copy those two files to `frontend/public/games/hyperion/` after editing; there is no game React/Vite build. See [extension setup](extension/README.md) for the companion overlay.

Browser codec support varies. MP4/WebM are the best starting point; unsupported local codecs cannot become playable merely by changing the filename. Calls require browser permissions and suitable secure contexts.

## Engineering lessons

- Authorize each socket event; an authenticated connection alone is insufficient.
- Keep guest identity stable while socket IDs change during reconnection.
- Validate room targets and derive sender identity on the server.
- Separate signaling success from actual WebRTC media delivery.
- Preserve working media code while removing unused scaffolding and inaccurate setup instructions.

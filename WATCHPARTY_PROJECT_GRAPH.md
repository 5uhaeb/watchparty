# PROJECT_GRAPH.md — WatchParty Repo Map for Codex / AI Coding

Repo: `https://github.com/5uhaeb/watchparty`  
Purpose: give Codex / AI tools a fast, repo-level mental model so they do not waste tokens re-discovering the project.

---

## 1. Project Summary

This is a full-stack WatchParty starter app.

Main features:
- Next.js frontend
- Express + Socket.IO backend
- MongoDB Atlas persistence
- Anonymous guest identity / guest bootstrap
- Room creation and join flow
- Real-time room chat
- Basic playback sync
- WebRTC local-file streaming/sync
- Browser extension for Netflix / Prime Video playback-position sync
- E2E test harness using Playwright

Important streaming rule:
- The app should not capture, rebroadcast, download, or bypass DRM-protected streams.
- YouTube links and local file streaming are supported.
- Netflix / Prime / Hotstar-style OTT support should be sync-only through the extension/browser control layer.
- Each viewer must access the protected service/title legally through their own account.

---

## 2. High-Level Architecture

```text
User Browser
   |
   | Next.js app
   v
frontend/
   | REST API calls
   | Socket.IO client events
   v
backend/
   | Express REST API
   | Socket.IO real-time server
   | Mongoose models
   v
MongoDB Atlas

Optional:
extension/
   |
   | observes/controls existing page <video>
   | talks to backend Socket.IO
   v
backend Socket.IO

Optional:
WebRTC local-file streaming
   |
   | Host browser streams local video directly to peers
   | Backend relays SDP/ICE signaling only
   v
Viewer browsers
```

---

## 3. Root Structure

```text
watchparty/
├── .github/workflows/          # CI / workflow files if present
├── backend/                    # Express + Socket.IO + MongoDB backend
├── docs/                       # Project docs
├── extension/                  # MV3 browser extension for OTT sync
├── frontend/                   # Next.js web app
├── tests/e2e/                  # Playwright E2E tests
├── .gitignore
├── README.md
├── package.json                # root scripts for E2E tests
├── package-lock.json
├── playwright.config.ts
└── render.yaml                 # Render backend deployment config
```

---

## 4. Tech Stack

### Frontend

Location: `frontend/`

Uses:
- Next.js 14
- React 18
- TypeScript
- NextAuth dependency exists
- Socket.IO client
- CSS via `frontend/src/app/globals.css`

Important package scripts:
```bash
cd frontend
npm install
npm run dev
npm run build
npm run start
npm run lint
```

Expected local URL:
```text
http://localhost:3000
```

### Backend

Location: `backend/`

Uses:
- Node.js
- Express
- Socket.IO
- MongoDB / Mongoose
- CORS
- Express rate limiting
- Redis / ioredis / ioredis-mock dependency exists
- Socket.IO Redis adapter dependency exists

Important package scripts:
```bash
cd backend
npm install
npm run dev
npm start
```

Expected local URL:
```text
http://localhost:5000
```

### Extension

Location: `extension/`

Uses:
- Browser extension Manifest V3
- Service worker background script
- Content scripts for Netflix and Prime Video
- Vendored Socket.IO client
- Popup UI for backend URL, web app URL, room code, and token

Important:
- Checked-in `.js` files are what Chrome/Edge load.
- `.ts` files are source mirrors.
- Load `extension/` as an unpacked extension.

### Tests

Location: `tests/e2e/`

Root scripts:
```bash
npm run test:e2e
npm run test:e2e:install
```

---

## 5. Environment Variables

### Backend `.env`

Location:
```text
backend/.env
```

Expected variables:
```env
PORT=5000
CLIENT_URL=http://localhost:3000
MONGODB_URI=your_mongodb_atlas_uri
REDIS_URL=redis://localhost:6379
GUEST_JWT_SECRET=replace_me
EXTENSION_TOKEN_SECRET=replace_me
EXTENSION_INTERNAL_SECRET=replace_me
```

Notes:
- `CLIENT_URL` controls CORS.
- `MONGODB_URI` is required for MongoDB persistence.
- `REDIS_URL` is intended for transient live presence. If unset outside production, local dev may fall back to mock behavior depending on current implementation.
- `EXTENSION_TOKEN_SECRET` signs short-lived extension JWTs.
- `EXTENSION_INTERNAL_SECRET` is shared between the frontend API route and backend token endpoint.

### Frontend `.env.local`

Location:
```text
frontend/.env.local
```

Expected variables:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000

NEXT_PUBLIC_STUN_URLS=stun:stun.l.google.com:19302
NEXT_PUBLIC_TURN_URL=
NEXT_PUBLIC_TURN_USER=
NEXT_PUBLIC_TURN_CRED=
```

Notes:
- `NEXT_PUBLIC_API_URL` points to Express REST API.
- `NEXT_PUBLIC_SOCKET_URL` points to Socket.IO backend.
- TURN credentials are required for reliable cross-network WebRTC local-file streaming.

---

## 6. Backend File Graph

```text
backend/
├── .env.example
├── package.json
└── src/
    ├── app.js
    ├── server.js
    ├── config/
    │   └── db.js
    ├── models/
    │   ├── Guest.js
    │   ├── Message.js
    │   └── Room.js
    ├── routes/
    │   ├── authRoutes.js
    │   └── roomRoutes.js
    └── socket/
        └── roomSocket.js
```

### `backend/src/server.js`

Role:
- Loads env vars.
- Creates HTTP server from Express app.
- Creates Socket.IO server.
- Connects MongoDB.
- Registers Socket.IO connection handler.
- Starts backend server on `PORT || 5000`.

Flow:
```text
dotenv.config()
connectDB()
http.createServer(app)
new Socket.IO Server(server, cors config)
io.on("connection", socket => registerRoomSocket(io, socket))
server.listen(...)
```

### `backend/src/app.js`

Role:
- Express app setup.
- CORS setup.
- Rate limiter.
- Health route.
- REST route mounting.

Important routes:
```text
GET  /api/health
/api/auth   -> authRoutes
/api/rooms  -> roomRoutes
```

Important behavior:
- Uses `app.set('trust proxy', 1)`.
- CORS origin is `process.env.CLIENT_URL`.
- Rate limit: 100 requests / 15 minutes / IP on `/api/`.

### `backend/src/config/db.js`

Role:
- MongoDB/Mongoose connection helper.
- Usually edit here for connection logging, retry logic, or DB config.

### `backend/src/models/Guest.js`

Role:
- Anonymous guest model.
- Fields:
  - `_id`
  - `displayName`
  - `lastSeenAt`
  - `avatarHue`
- Has TTL index on `lastSeenAt` for guest expiry.

Use this when:
- Changing guest identity behavior.
- Adjusting anonymous user retention.
- Adding avatar/display fields.

### `backend/src/models/Room.js`

Role:
- Main room document model.

Important fields:
```js
code
name
hostUserId
sourceType: 'youtube' | 'local' | 'ott-sync'
sourceData: {
  url,
  fileName,
  ottPlatform
}
playback: {
  isPlaying,
  currentTime,
  updatedAt
}
participants[]
isActive
timestamps
```

Use this when:
- Adding room settings.
- Adding invite/friend metadata.
- Changing supported source types.
- Adding host-only permissions.
- Saving playback/session state.

### `backend/src/models/Message.js`

Role:
- Chat/system message persistence.

Current schema shape:
```js
roomId
userId
username
type: 'chat' | 'system'
text
timestamps
```

Important caution:
- Some socket code may reference message fields like `roomCode` / `userName`.
- Before changing chat logic, verify the live schema and socket usage match.
- If chat breaks, check mismatch between `Message.create(...)` payload and `Message.js` required fields.

### `backend/src/routes/roomRoutes.js`

Role:
- REST API for room creation, lookup, and closing.

Routes:
```text
POST   /api/rooms
GET    /api/rooms/:code
DELETE /api/rooms/:code
```

Main functions:
- `generateCode(length = 6)` creates room codes.
- `POST /` creates room with:
  - `name`
  - `hostUserId`
  - `sourceType`
  - `sourceData`
- `GET /:code` fetches active room.
- `DELETE /:code` closes room if requester is host.

Use this when:
- Editing create-room flow.
- Adding source validation.
- Adding host-only route protection.
- Adding room close/delete behavior.

### `backend/src/routes/authRoutes.js`

Role:
- Guest/auth bootstrap route area.
- Mounted at `/api/auth`.

Use this when:
- Editing anonymous guest creation.
- Adding signed cookie behavior.
- Adding login/account upgrade later.
- Adding extension token server endpoint if this repo uses auth route for token issue.

### `backend/src/socket/roomSocket.js`

Role:
- Main Socket.IO real-time room logic.

Important events:
```text
room:join
room:state
reconnect:sync
chat:send
chat:new
playback:update
room:kick
room:kicked
call:join
call:signal
call:leave
call:user-joined
call:user-left
disconnect
```

Main behavior:
- Joins socket to room code.
- Adds participant to room.
- Emits full room state and recent messages.
- Sends playback catch-up sync to reconnecting/joining socket.
- Saves/broadcasts chat messages.
- Broadcasts host-only playback updates.
- Allows host to kick participants.
- Relays WebRTC call signaling messages.
- Removes participant on disconnect.

Important caution:
- Host-only playback uses `room.hostUserId === userId`.
- Kick flow targets by participant name.
- Disconnect currently removes participant immediately in simple socket flow. If Redis reconnect grace logic exists elsewhere or is intended, do not remove it accidentally.

---

## 7. Frontend File Graph

```text
frontend/
├── .env.example
├── next-env.d.ts
├── next.config.js
├── package.json
├── tsconfig.json
└── src/
    ├── app/
    │   ├── api/auth/[...nextauth]/
    │   ├── create-room/
    │   ├── dashboard/
    │   ├── room/[code]/
    │   ├── globals.css
    │   ├── layout.tsx
    │   └── page.tsx
    ├── components/
    │   ├── ChatBox.tsx
    │   ├── Navbar.tsx
    │   ├── Providers.tsx
    │   ├── RoomPlayer.tsx
    │   ├── UserList.tsx
    │   ├── VideoCallPanel.tsx
    │   └── YouTubePlayer.tsx
    └── lib/
        ├── api.ts
        ├── formats.ts
        ├── iceServers.ts
        ├── probeFile.ts
        ├── socket.ts
        └── videoFormats.ts
```

### `frontend/src/app/page.tsx`

Role:
- Landing/home page.
- Usually edit for marketing copy, entry buttons, and redirect links.

### `frontend/src/app/layout.tsx`

Role:
- Root app layout.
- Usually wraps global CSS, metadata, navbar/providers.

### `frontend/src/app/globals.css`

Role:
- Global styling.
- Edit for layout colors, dark theme, base UI polish.

### `frontend/src/app/dashboard/`

Role:
- Dashboard page after guest/session bootstrap.
- Likely shows create/join room actions.

### `frontend/src/app/create-room/`

Role:
- UI for creating a room.
- Should call backend `POST /api/rooms`.
- Usually passes room name, host user ID, source type, and source data.

### `frontend/src/app/room/[code]/`

Role:
- Dynamic room page.
- Loads room by code.
- Connects to Socket.IO.
- Renders room player, chat, users, and video call panel.

### `frontend/src/app/api/auth/[...nextauth]/`

Role:
- NextAuth API route area.
- Use this if Google OAuth / accounts are restored.
- In current README direction, anonymous guest identity is the core flow, so check current implementation before adding OAuth changes.

### `frontend/src/components/ChatBox.tsx`

Role:
- Chat UI.
- Emits `chat:send`.
- Renders `chat:new` / loaded message list.

Use this when:
- Fixing chat send.
- Improving message rendering.
- Adding persistent/system messages.
- Adding chat timestamps.

### `frontend/src/components/Navbar.tsx`

Role:
- Top navigation.
- Usually edit for links, app title, sign-in/guest indicator.

### `frontend/src/components/Providers.tsx`

Role:
- Client-side provider wrapper.
- Usually includes session/context providers.

### `frontend/src/components/RoomPlayer.tsx`

Role:
- Main playback component router.
- Chooses between YouTube, local file, OTT sync, or other source modes.
- Coordinates playback state with socket events.

Use this when:
- Adding a new media source.
- Fixing playback sync.
- Handling host-only controls.
- Connecting local file WebRTC mode.

### `frontend/src/components/YouTubePlayer.tsx`

Role:
- YouTube playback component.
- Use this when implementing iframe/player sync for YouTube.

### `frontend/src/components/UserList.tsx`

Role:
- Shows room participants.
- Likely handles host kick UI.

### `frontend/src/components/VideoCallPanel.tsx`

Role:
- WebRTC call/local streaming/signaling UI.
- Uses Socket.IO signaling events.
- Uses ICE server config from `lib/iceServers.ts`.

Use this when:
- Fixing camera/file stream negotiation.
- Debugging offer/answer/ICE.
- Adding TURN support.
- Improving local file stream viewing.

### `frontend/src/lib/api.ts`

Role:
- Frontend REST API helper.
- Central place for backend API calls.

Use this when:
- Changing backend endpoint URLs.
- Adding typed fetch helpers.
- Fixing frontend/backend deployment URL mismatch.

### `frontend/src/lib/socket.ts`

Role:
- Socket.IO client setup.
- Central place for frontend socket connection URL.

Use this when:
- Fixing socket connection errors.
- Changing `NEXT_PUBLIC_SOCKET_URL`.
- Adding auth token/socket query params.

### `frontend/src/lib/iceServers.ts`

Role:
- Builds WebRTC STUN/TURN server config from env vars.

Use this when:
- Fixing cross-network local streaming.
- Adding TURN provider credentials.

### `frontend/src/lib/probeFile.ts`

Role:
- Local file detection/probing helper.
- Use this when validating file codec/container support.

### `frontend/src/lib/formats.ts` and `videoFormats.ts`

Role:
- Supported media/source format helpers.
- Use this when editing accepted file types or display labels.

---

## 8. Extension File Graph

```text
extension/
├── README.md
├── manifest.json
├── background.ts
├── background.js
├── content-netflix.ts
├── content-netflix.js
├── content-prime.ts
├── content-prime.js
├── popup.html
├── popup.ts
├── popup.js
├── icons/
└── vendor/
    └── socket.io.min.js
```

### Extension purpose

The extension syncs playback position across Netflix and Prime Video tabs by:
- Finding the existing page `<video>` element.
- Observing play/pause/seek/time updates.
- Sending sync events through the WatchParty backend Socket.IO server.
- Receiving remote sync events and applying them to the local video.

It must not:
- Download video.
- Capture DRM media.
- Rebroadcast stream bytes.
- Bypass encryption or service restrictions.

### `extension/manifest.json`

Role:
- MV3 extension config.
- Defines permissions, content scripts, background service worker, popup, icons.

### `extension/background.js` / `background.ts`

Role:
- Service worker.
- Owns Socket.IO connection.
- Relays messages between content scripts and backend socket.

### `extension/content-netflix.js` / `.ts`

Role:
- Netflix adapter.
- Finds/controls Netflix page video element.

### `extension/content-prime.js` / `.ts`

Role:
- Prime Video adapter.
- Finds/controls Prime page video element.

### `extension/popup.html`, `popup.js`, `popup.ts`

Role:
- Extension popup UI.
- User enters:
  - Backend Socket.IO URL
  - Web App URL
  - Room code
  - Extension token

### `extension/vendor/socket.io.min.js`

Role:
- Vendored Socket.IO browser client loaded by the extension service worker.

---

## 9. Runtime Flow: Create and Join Room

```text
1. User opens frontend.
2. User creates/uses anonymous guest identity.
3. User goes to create-room page.
4. Frontend calls:
   POST /api/rooms
   body: { name, hostUserId, sourceType, sourceData }
5. Backend creates MongoDB Room.
6. Backend returns room with generated code.
7. Frontend navigates to /room/[code].
8. Room page connects to Socket.IO backend.
9. Frontend emits:
   room:join { roomCode, user }
10. Backend socket:
   - socket.join(roomCode)
   - adds participant
   - loads recent messages
   - emits room:state
   - sends reconnect:sync to joining user
```

---

## 10. Runtime Flow: Chat

```text
Frontend ChatBox
   |
   | socket.emit("chat:send", { roomCode, userName, text })
   v
backend/src/socket/roomSocket.js
   |
   | saves Message
   | emits "chat:new"
   v
all clients in room
```

Important caution:
- Verify Message model fields match `roomSocket.js`.
- If chat errors occur, likely cause is schema mismatch:
  - Socket may send/create `roomCode`, `userName`
  - Model may require `roomId`, `userId`, `username`

Codex should check and align these before adding chat features.

---

## 11. Runtime Flow: Playback Sync

```text
Host player changes playback
   |
   | socket.emit("playback:update", { roomCode, playback, userId })
   v
backend socket checks hostUserId
   |
   | if host: save playback state to Room
   | socket.to(roomCode).emit("playback:update", playback)
   v
viewer clients update player state
```

Important:
- Only host should broadcast playback.
- Joining users receive catch-up state using `reconnect:sync`.
- If playback drift occurs, check:
  - timestamp handling
  - currentTime offset calculation
  - host-only permission check
  - player event throttling/debouncing

---

## 12. Runtime Flow: WebRTC Local File Streaming

```text
Host chooses local file in browser
   |
   | Browser decodes file locally
   | Host creates MediaStream / peer connection
   v
Socket.IO signaling
   |
   | call:join
   | call:signal offer/answer/ICE
   | call:leave
   v
Viewer peer connection receives media stream
```

Important:
- Backend does not upload/store video bytes.
- Backend only relays signaling messages.
- STUN may work on same/easy networks.
- TURN is needed for strict NAT/mobile networks.

Likely files involved:
```text
frontend/src/components/VideoCallPanel.tsx
frontend/src/lib/iceServers.ts
frontend/src/lib/probeFile.ts
frontend/src/lib/videoFormats.ts
backend/src/socket/roomSocket.js
```

---

## 13. Runtime Flow: OTT Extension Sync

```text
User opens WatchParty web room
   |
   | gets extension token from web app/backend route
   v
Extension popup
   |
   | user enters backend URL, web app URL, room code, token
   v
background service worker
   |
   | connects to backend Socket.IO
   v
content script on Netflix/Prime page
   |
   | observes existing <video>
   | sends playback changes
   | receives sync commands
```

Important:
- The extension syncs playback controls only.
- It should not stream or rebroadcast protected media.
- Each viewer must open the same title themselves.

Likely files involved:
```text
extension/background.js
extension/content-netflix.js
extension/content-prime.js
extension/popup.js
backend/src/routes/authRoutes.js or extension token route
backend/src/socket/roomSocket.js
```

---

## 14. Deployment Graph

### Frontend on Vercel

Root directory:
```text
frontend
```

Build:
```bash
npm install
npm run build
```

Start:
```bash
npm run start
```

Frontend env on Vercel:
```env
NEXT_PUBLIC_API_URL=https://your-render-backend.onrender.com/api
NEXT_PUBLIC_SOCKET_URL=https://your-render-backend.onrender.com
NEXT_PUBLIC_STUN_URLS=stun:stun.l.google.com:19302
NEXT_PUBLIC_TURN_URL=
NEXT_PUBLIC_TURN_USER=
NEXT_PUBLIC_TURN_CRED=
```

### Backend on Render

Root directory:
```text
backend
```

Build command:
```bash
npm install
```

Start command:
```bash
npm start
```

Backend env on Render:
```env
PORT=5000
CLIENT_URL=https://your-vercel-app.vercel.app
MONGODB_URI=your_mongodb_atlas_uri
REDIS_URL=your_redis_url
GUEST_JWT_SECRET=strong_secret
EXTENSION_TOKEN_SECRET=strong_secret
EXTENSION_INTERNAL_SECRET=strong_secret
```

Important:
- `CLIENT_URL` must exactly match frontend URL for CORS.
- `NEXT_PUBLIC_API_URL` must include `/api`.
- `NEXT_PUBLIC_SOCKET_URL` should not include `/api`.

---

## 15. Common Debugging Map

### Frontend says backend link broken / API fails

Check:
```text
frontend/.env.local or Vercel env:
NEXT_PUBLIC_API_URL
```

Expected:
```text
http://localhost:5000/api
https://your-backend.onrender.com/api
```

Also check backend:
```text
CLIENT_URL
```

Expected:
```text
http://localhost:3000
https://your-frontend.vercel.app
```

### Socket does not connect

Check:
```text
NEXT_PUBLIC_SOCKET_URL
CLIENT_URL
backend server Socket.IO CORS
```

Expected:
```text
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
```

Not:
```text
http://localhost:5000/api
```

### Chat fails

Check:
```text
backend/src/socket/roomSocket.js
backend/src/models/Message.js
```

Likely issue:
- required schema fields do not match payload fields.

Fix direction:
- Use one consistent schema:
  - Either `roomCode`, `userName`
  - Or `roomId`, `userId`, `username`
- Update create/query/render paths together.

### Room creation fails

Check:
```text
backend/src/routes/roomRoutes.js
frontend/src/app/create-room/
frontend/src/lib/api.ts
```

Required body:
```js
{
  name,
  hostUserId,
  sourceType,
  sourceData
}
```

### Playback sync fails

Check:
```text
backend/src/socket/roomSocket.js
frontend/src/components/RoomPlayer.tsx
frontend/src/components/YouTubePlayer.tsx
```

Likely issue:
- userId does not match `room.hostUserId`
- frontend sends wrong `userId`
- player emits too often or not at all
- viewers ignore incoming update

### Local file streaming fails across networks

Check:
```text
frontend/src/lib/iceServers.ts
NEXT_PUBLIC_TURN_URL
NEXT_PUBLIC_TURN_USER
NEXT_PUBLIC_TURN_CRED
```

Likely issue:
- STUN only works on easy networks.
- TURN server required for mobile/strict NAT.

### Extension does not connect

Check:
```text
extension/popup.js
extension/background.js
backend extension token route
EXTENSION_TOKEN_SECRET
EXTENSION_INTERNAL_SECRET
backend Socket.IO URL
room code
```

Also verify:
- Extension loaded unpacked from `extension/`.
- Browser has permission for the target domain.
- Content script matches Netflix/Prime URL.
- Backend URL is base URL, not `/api`.

---

## 16. Best Places to Edit by Feature

### Add better room settings
Edit:
```text
backend/src/models/Room.js
backend/src/routes/roomRoutes.js
frontend/src/app/create-room/
frontend/src/app/room/[code]/
```

### Add friends/invites
Edit/add:
```text
backend/src/models/Guest.js or new User/Friend models
backend/src/routes/
frontend/src/app/dashboard/
frontend/src/components/Navbar.tsx
```

### Add persistent chat improvements
Edit:
```text
backend/src/models/Message.js
backend/src/socket/roomSocket.js
frontend/src/components/ChatBox.tsx
```

### Add host-only controls
Edit:
```text
backend/src/socket/roomSocket.js
frontend/src/components/RoomPlayer.tsx
frontend/src/components/UserList.tsx
backend/src/routes/roomRoutes.js
```

### Add YouTube iframe adapter
Edit:
```text
frontend/src/components/YouTubePlayer.tsx
frontend/src/components/RoomPlayer.tsx
backend/src/socket/roomSocket.js
```

### Improve local file WebRTC streaming
Edit:
```text
frontend/src/components/VideoCallPanel.tsx
frontend/src/lib/iceServers.ts
frontend/src/lib/probeFile.ts
frontend/src/lib/videoFormats.ts
backend/src/socket/roomSocket.js
```

### Improve extension support
Edit:
```text
extension/background.ts
extension/background.js
extension/content-netflix.ts
extension/content-netflix.js
extension/content-prime.ts
extension/content-prime.js
extension/popup.ts
extension/popup.js
backend/src/routes/
backend/src/socket/roomSocket.js
```

### Add real user accounts/OAuth
Edit:
```text
frontend/src/app/api/auth/[...nextauth]/
frontend/src/components/Providers.tsx
backend/src/routes/authRoutes.js
backend/src/models/Guest.js or new User.js
```

---

## 17. AI/Codex Working Rules for This Repo

When Codex edits this repo, follow these rules:

1. Do not re-architect unless asked.
2. Keep frontend and backend env variable names consistent.
3. Do not put `/api` in Socket.IO URL.
4. Keep protected streaming support sync-only.
5. Never implement DRM bypass, media capture, or rebroadcasting protected OTT content.
6. When editing chat, first align `Message.js` with `roomSocket.js`.
7. When editing playback, preserve host-only permission checks.
8. When editing WebRTC, remember backend is signaling-only.
9. When editing extension files, update both `.ts` source mirrors and `.js` loaded files unless the repo has a build step.
10. Keep local dev simple:
    - backend on `localhost:5000`
    - frontend on `localhost:3000`
11. Prefer small patches with clear feature boundaries.
12. After backend route changes, update `frontend/src/lib/api.ts`.
13. After socket event changes, update both frontend socket listeners and backend socket emitters.
14. After model schema changes, verify every create/query/update call.

---

## 18. Suggested First Fixes / Refactor Targets

### A. Chat schema mismatch audit

Check:
```text
backend/src/models/Message.js
backend/src/socket/roomSocket.js
frontend/src/components/ChatBox.tsx
```

Goal:
- Ensure messages are created with all required fields.
- Ensure history query uses the same room identifier field.
- Ensure frontend renders the same field names.

### B. Auth route existence / route naming audit

Check:
```text
backend/src/app.js
backend/src/routes/authRoutes.js
frontend/src/app/api/auth/[...nextauth]/
```

Goal:
- Ensure backend does not require missing route files.
- Ensure anonymous guest bootstrap works.
- Ensure extension token route exists where docs say it exists.

### C. Redis presence vs immediate disconnect removal audit

Check:
```text
README.md
backend/src/socket/roomSocket.js
```

Goal:
- README says Redis-backed transient presence with 60-second reconnect grace.
- Ensure actual socket disconnect logic matches that design.

### D. Deployment env cleanup

Check:
```text
render.yaml
backend/.env.example
frontend/.env.example
README.md
```

Goal:
- Make env names consistent:
  - `GUEST_JWT_SECRET` vs `JWT_SECRET`
  - extension secrets
  - Redis URL
  - frontend/backend URLs

---

## 19. Quick Commands

### Local backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

### Local frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

### Root E2E

```bash
npm install
npm run test:e2e:install
npm run test:e2e
```

### Git add this graph file

```bash
git add PROJECT_GRAPH.md
git commit -m "Add project graph for AI coding context"
git push
```

---

## 20. One-Sentence Context for AI Tools

This repo is a Next.js + Express + Socket.IO + MongoDB WatchParty app with anonymous guests, room creation, chat, host-controlled playback sync, WebRTC local-file streaming via signaling, and a Manifest V3 OTT sync extension; keep protected streaming sync-only and edit frontend/backend/socket/model files together when changing shared flows.

# WatchParty OTT Sync Extension

Manifest V3 browser extension for syncing playback position across Netflix, Prime Video, and Hotstar/JioHotstar tabs through the existing WatchParty Socket.IO backend.

## Scope and Notice

This extension only observes and controls the page's existing HTML `<video>` element. It does not capture streams, bypass DRM, tamper with encrypted media, download video, or rebroadcast content. Each participant must have their own valid access to the streaming service and must open the same title themselves.

Use this only where it complies with the streaming service terms that apply to you.

## Files

- `manifest.json`: MV3 extension manifest.
- `background.ts` / `background.js`: service worker that owns the Socket.IO connection.
- `ott-sync-math.ts` / `ott-sync-math.js`: small shared drift and event-loop helpers.
- `content-core.ts` / `content-core.js`: shared video detection, listener wiring, heartbeat, drift correction, and remote-event application.
- `content-netflix.ts` / `content-netflix.js`: Netflix provider registration.
- `content-prime.ts` / `content-prime.js`: Prime Video provider registration.
- `content-hotstar.ts` / `content-hotstar.js`: Hotstar/JioHotstar provider registration, including IPL streams opened by each subscriber.
- `popup.html` / `popup.ts` / `popup.js`: room code, backend URL, web app URL, and token entry.
- `vendor/socket.io.min.js`: vendored Socket.IO client used by the service worker.

The `*.ts` files are the source mirrors. The checked-in `*.js` files are what Chrome loads when using "Load unpacked".

## Backend and Web App Setup

Set these environment variables on the deployed backend and frontend:

- `EXTENSION_TOKEN_SECRET`: backend signing secret for short-lived extension JWTs. If omitted, the backend falls back to `GUEST_JWT_SECRET` or `SESSION_SECRET`.
- `NEXT_PUBLIC_API_URL`: frontend URL for the backend API, used by the web app token route.

The web app exposes:

- `GET /api/extension/token`: forwards the anonymous guest cookie to the backend and returns `{ token, expiresAt }`.

The backend exposes:

- `POST /api/extension/token`: called by the web app API route, not directly by the extension.

## Load Unpacked in Chrome or Edge

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select the repo's `extension/` folder.
5. Sign in to the WatchParty web app.
6. Open the extension popup.
7. Enter:
   - Backend Socket.IO URL, for example `https://your-backend.onrender.com`.
   - Web App URL, for example `https://your-app.vercel.app`.
   - Room code.
8. Click "Get Token"; copy the returned `token` value.
9. Paste the token into the popup and click "Connect".
10. In the room, choose **Change Source** -> **OTT / Hotstar** and select the provider. Host-only control is the default; admins can allow everyone to control playback from room permissions.
11. Open the same Netflix, Prime Video, or Hotstar/JioHotstar title or IPL match in each browser profile and use playback normally. The controller sends play, pause, seek, and heartbeat events; followers apply those events to their own logged-in tab.

## Sync Behavior

- The extension picks the most likely main video by preferring visible, active, non-preview video elements with useful duration and readiness.
- SPA navigation, episode changes, delayed player load, and shadow DOM players are handled by repeated scans plus a `MutationObserver`.
- Heartbeats are sent every 4 seconds only while the active controller is playing.
- Small drift is ignored, medium drift is corrected with temporary `playbackRate`, and large drift seeks directly.
- Provider and room metadata are included so Netflix tabs do not apply Prime or Hotstar room events.

## Firefox MV3 Caveats

Firefox MV3 support differs from Chromium, especially around service worker lifetime and extension APIs. This extension is targeted at Chromium-based browsers first. Firefox may require a persistent background script adaptation and different manifest keys before it behaves reliably.

## Troubleshooting

- If the popup says a token is invalid, generate a new one; tokens are intentionally short-lived.
- If the popup says "Wrong source selected", open the WatchParty room and choose an OTT source matching the tab provider.
- If the popup says "Backend unreachable", confirm the Socket.IO URL and backend CORS settings.
- If the popup says "Video not detected", start playback in the OTT tab, dismiss previews/ads if needed, then reload the OTT tab.
- If a tab does not sync after navigating inside Netflix, Prime Video, or Hotstar/JioHotstar, reload that streaming tab. The content script uses a `MutationObserver` for SPA navigation, but streaming pages can occasionally replace players in unusual ways.
- If Socket.IO fails to connect, confirm backend CORS allows `chrome-extension://` origins and that the backend URL points at the Socket.IO server, not the frontend.

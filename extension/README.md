# WatchParty OTT Sync Extension

Manifest V3 browser extension for syncing playback position across Netflix, Prime Video, and Hotstar/JioHotstar tabs through the existing WatchParty Socket.IO backend.

## Scope and Notice

This extension only observes and controls the page's existing HTML `<video>` element. It does not capture streams, bypass DRM, tamper with encrypted media, download video, or rebroadcast content. Each participant must have their own valid access to the streaming service and must open the same title themselves.

Use this only where it complies with the streaming service terms that apply to you.

## Files

- `manifest.json`: MV3 extension manifest.
- `background.ts` / `background.js`: service worker that owns the Socket.IO connection.
- `content-netflix.ts` / `content-netflix.js`: Netflix video adapter.
- `content-prime.ts` / `content-prime.js`: Prime Video video adapter.
- `content-hotstar.ts` / `content-hotstar.js`: Hotstar/JioHotstar video adapter, including IPL streams opened by each subscriber.
- `popup.html` / `popup.ts` / `popup.js`: room code, backend URL, web app URL, and token entry.
- `vendor/socket.io.min.js`: vendored Socket.IO client used by the service worker.

The `*.ts` files are the source mirrors. The checked-in `*.js` files are what Chrome loads when using "Load unpacked".

## Backend and Web App Setup

Set these environment variables on the deployed backend and frontend:

- `EXTENSION_TOKEN_SECRET`: shared signing secret for short-lived extension JWTs. If omitted, the backend falls back to `NEXTAUTH_SECRET`.
- `EXTENSION_INTERNAL_SECRET`: shared secret used by the authenticated web app API route when requesting a backend token.

The web app exposes:

- `GET /api/extension/token`: requires a signed-in web session and returns `{ token, expiresAt }`.

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
10. In the room, choose **Change Source** -> **OTT / Hotstar**.
11. Open the same Netflix, Prime Video, or Hotstar/JioHotstar title or IPL match in each browser profile and use playback normally.

## Firefox MV3 Caveats

Firefox MV3 support differs from Chromium, especially around service worker lifetime and extension APIs. This extension is targeted at Chromium-based browsers first. Firefox may require a persistent background script adaptation and different manifest keys before it behaves reliably.

## Troubleshooting

- If the popup says a token is invalid, generate a new one; tokens are intentionally short-lived.
- If a tab does not sync after navigating inside Netflix, Prime Video, or Hotstar/JioHotstar, reload that streaming tab. The content script uses a `MutationObserver` for SPA navigation, but streaming pages can occasionally replace players in unusual ways.
- If Socket.IO fails to connect, confirm backend CORS allows `chrome-extension://` origins and that the backend URL points at the Socket.IO server, not the frontend.

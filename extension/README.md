# WatchParty Companion Extension

This Chrome/Edge MV3 extension injects a WatchParty sidebar on Hotstar/JioHotstar pages. It does not bypass DRM, frame protection, subscriptions, or downloads. It only controls the local page video element and connects chat/reactions/playback sync to an existing WatchParty room.

## Install locally

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select this `extension/` folder.
5. Open a Hotstar/JioHotstar video tab.
6. Click the WatchParty extension icon and enter:
   - Room code
   - Name
   - Socket URL, for example `https://watchparty-6a3e.onrender.com`
   - API URL, for example `https://watchparty-6a3e.onrender.com/api`

The overlay appears on the video page with chat, reactions, participant count, and Sync.

## Safety boundary

- No video capture.
- No DRM bypass.
- No X-Frame-Options or CSP stripping.
- No downloading or rebroadcasting OTT media.

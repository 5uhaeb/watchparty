# PR: Multi-user RTC and Sync

## Root-cause writeup

The blank remote-tile bug was not one single line. The call code had peer connections in a map, but the inbound stream lifecycle was too fragile:

- A remote `MediaStream` object was mutated in place as tracks arrived, so React could keep the same object identity and a tile might not reliably reattach after later tracks or reconnects.
- The remote video tile did not explicitly own an attached-stream ref, so `srcObject` assignment was tied to parent render timing.
- Audio mute disabled sender tracks, which can make remote media state look ended or unstable on some browsers.
- Failed ICE only scheduled a delayed restart and did not force a fresh media sync after reconnect.

The fix keeps the mesh topology but makes the lifecycle explicit: each peer socket has one `RTCPeerConnection`, inbound track changes publish a fresh `MediaStream` object, and `RemoteVideoTile` owns its own `videoRef`/`srcObject` attachment.

## Screenshots/GIFs

Not captured in this environment. The implemented modes are:

- Fullscreen mode 1: side panel.
- Fullscreen mode 2: cinema layout with call strip and collapsed chat/user cards.
- Fullscreen mode 3: overlay-only rounded thumbnails with call controls hidden.

## Manual test matrix executed locally

Automated build and unit checks were executed:

- `npm run build` in `frontend`
- `npm run test:unit`
- `node --check backend/src/socket/roomSocket.js`

Browser multi-window media testing still needs to be run against deployed Vercel/Render with real camera/mic devices and production TURN credentials.

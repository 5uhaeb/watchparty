# WatchParty Project Graph

This file maps the major WatchParty runtime pieces for future implementation work.

## Runtime Overview

- `frontend/` contains the Next.js watch room, player, chat, call, and WebRTC client code.
- `backend/` contains Express, Socket.IO room state, signaling, chat, and presence.
- `audio-server/` contains the Dockerized Janus Gateway AudioBridge media server.
- Local video bytes stay in the browser. The backend relays metadata and WebRTC signaling only.
- Protected OTT services are sync-only. The app must not capture, bypass DRM, download, or rebroadcast protected streams.

## Watch Room Components

- `frontend/src/app/room/[code]/page.tsx` owns the room layout and passes room/source state to the player and call panel.
- `frontend/src/components/RoomPlayer.tsx` chooses between YouTube, local file playback, OTT sync controls, and local WebRTC streaming.
- `frontend/src/components/LocalStreamPlayer.tsx` handles host local-file WebRTC streaming and marks real video elements with `data-watch-media`.
- `frontend/src/players/LocalFilePlayer.tsx` renders local file playback and marks the video element with `data-watch-media`.
- `frontend/src/components/VideoCallPanel.tsx` owns video-call peer connections for camera video and delegates room audio to Janus AudioBridge.
- `frontend/src/components/RoomAudioControls.tsx` connects the user microphone and watch player audio to the room audio server and plays the mixed room output.

## Server-Side Watch Party Audio Architecture

```txt
User Microphones + Watch Player Audio
        ↓
Janus AudioBridge on Render
        ↓
Server-side Opus audio mixing
        ↓
Single blended room audio
        ↓
All participants hear combined call + media audio
```

The deployable media server lives in `audio-server/`. It runs Janus Gateway with WebSocket transport and the `janus.plugin.audiobridge` plugin enabled. Rooms are created dynamically from the WatchParty room code, and clients publish Opus microphone audio plus capturable watch-player audio into the same AudioBridge room.

The frontend integration lives in `frontend/src/lib/janusAudioBridge.ts`, `frontend/src/lib/watchMediaAudioPublisher.ts`, and `frontend/src/components/RoomAudioControls.tsx`. `VideoCallPanel.tsx` keeps the existing peer-to-peer camera video path, but room audio is mixed by Janus instead of being sent as separated peer audio. The active watch player is discovered via `data-watch-media`, captured with `HTMLMediaElement.captureStream()` where supported, and published as a second AudioBridge participant named like a media bot.

This is not lossless. Janus receives Opus, mixes server-side, and sends a single mixed Opus stream back to each participant. High-bitrate 48 kHz Opus is configured for near-original quality, but it is still a lossy codec path.

TURN may be required for production reliability, especially for mobile, restrictive NAT, corporate networks, and hosted environments that do not expose UDP media ports cleanly. Render is useful for deployment and testing, but the free tier may not be ideal for low-latency WebRTC audio.

If `HTMLMediaElement.captureStream()` is unsupported or the media element has no capturable audio track, the UI warns the user and falls back to microphone-only AudioBridge mixing. YouTube iframes and protected OTT/DRM media cannot be captured by this app.

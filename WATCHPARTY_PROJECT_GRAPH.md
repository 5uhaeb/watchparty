# WatchParty Project Graph

This file maps the major WatchParty runtime pieces for future implementation work.

## Runtime Overview

- `frontend/` contains the Next.js watch room, player, chat, call, and WebRTC client code.
- `backend/` contains Express, Socket.IO room state, signaling, chat, and presence.
- Local video bytes stay in the browser. The backend relays metadata and WebRTC signaling only.
- Protected OTT services are sync-only. The app must not capture, bypass DRM, download, or rebroadcast protected streams.

## Watch Room Components

- `frontend/src/app/room/[code]/page.tsx` owns the room layout and passes room/source state to the player and call panel.
- `frontend/src/components/RoomPlayer.tsx` chooses between YouTube, local file playback, OTT sync controls, and local WebRTC streaming.
- `frontend/src/components/LocalStreamPlayer.tsx` handles host local-file WebRTC streaming and marks real video elements with `data-watch-media`.
- `frontend/src/players/LocalFilePlayer.tsx` renders local file playback and marks the video element with `data-watch-media`.
- `frontend/src/components/VideoCallPanel.tsx` owns video-call peer connections and sends camera video plus the mixed audio track.

## Watch Party Audio Architecture

```txt
Mic Audio + Watch Player Audio
        ↓
Web Audio API Mixer
        ↓
Single Mixed Audio Track
        ↓
WebRTC PeerConnection
        ↓
Remote Participants
```

The mixer lives in `frontend/src/lib/audioMixer.ts`. It mixes microphone audio and the active watch-player media element locally with the browser-native Web Audio API. Mic and media sources each pass through their own `GainNode`, then into `createMediaStreamDestination()` so the call layer can send one mixed `MediaStream` audio track over WebRTC.

Volume can be balanced independently for microphone audio, movie/media audio, and remote participant playback. Voice priority uses an `AnalyserNode` on the mic input to detect speech and gently lowers media volume while someone speaks, then restores the user-selected media volume after speech stops. It does not fully mute the movie.

If `HTMLMediaElement.captureStream()` is unsupported or a media element has no capturable audio track, the UI shows a friendly warning and keeps the normal voice call working. YouTube iframes and protected OTT/DRM media cannot be captured by this app.

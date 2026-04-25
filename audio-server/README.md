# WatchParty Janus AudioBridge Server

This service runs Janus Gateway with the AudioBridge plugin enabled. It is a real WebRTC media-server backend: participants publish Opus audio to Janus, Janus mixes the room server-side, and each client receives one blended room audio stream.

## Local Test

```bash
cd audio-server
docker compose up --build
```

Janus WebSocket URL:

```bash
ws://localhost:8188/janus
```

Frontend env:

```bash
NEXT_PUBLIC_AUDIO_SERVER_WS_URL=ws://localhost:8188/janus
VITE_AUDIO_SERVER_WS_URL=ws://localhost:8188/janus
```

Then run the app, open two browser windows, join the same room, start the call, play media, and verify mic audio plus capturable watch-player audio are heard from the mixed room output.

## Render Deployment

1. Use the repository root `render.yaml` Blueprint.
2. Render will deploy one Docker web service named `watchparty`.
3. nginx inside that service proxies `/janus` to Janus and everything else to the Node backend.
4. Set the frontend variable:

```bash
NEXT_PUBLIC_AUDIO_SERVER_WS_URL=wss://your-render-backend-url/janus
```

The user request mentions `VITE_AUDIO_SERVER_WS_URL`; this repo is a Next.js app, so `NEXT_PUBLIC_AUDIO_SERVER_WS_URL` is the variable that is exposed to browser code. The client also checks `VITE_AUDIO_SERVER_WS_URL` for Vite-compatible builds.

## Production Notes

- This is not lossless. Janus decodes, mixes, and re-encodes Opus audio.
- High-bitrate Opus at 48 kHz can sound near-original for voice plus media, but it is still lossy.
- TURN is often required for reliable production WebRTC, especially on mobile networks, corporate networks, and platforms that restrict UDP.
- Render web services are convenient for testing, but the free tier is not ideal for low-latency WebRTC. A paid instance, low-region distance, and TURN relay planning are strongly recommended.
- Browser media capture is limited. Local `<video>` elements and WebRTC local streams can usually be captured. YouTube iframes and protected OTT/DRM media generally cannot be captured by `HTMLMediaElement.captureStream()`.

## Ports

- `8188/tcp`: Janus WebSocket transport at `/janus`
- `20000-20100/udp`: local WebRTC RTP/RTCP media range

Render may not expose arbitrary UDP media ports the same way Docker Compose does. For Render deployments, plan for TURN relay support.

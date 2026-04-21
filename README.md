# WatchParty Starter

A simple full-stack watch party starter with:
- Next.js frontend
- Express + Socket.IO backend
- MongoDB Atlas
- Google OAuth with NextAuth
- Room creation, join, chat, and basic playback sync

## Important note on streaming platforms
This starter supports:
- YouTube links
- local file playback metadata sync

For Netflix, Prime Video, and Hotstar, this project is designed for **sync only**. It does not capture or rebroadcast protected streams. A browser extension is the practical next step for full remote-control sync on those sites.

## Project structure

```bash
watchparty-starter/
  backend/   # Node/Express API + Socket.io
  frontend/  # Next.js Web App
```

## Run locally

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

### 2. Frontend
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

## Production Deployment guide (CRITICAL)

When deploying to Render/Vercel, you **must** update your environment variables to point to your live URLs.

### Backend (Render)
- `CLIENT_URL`: `https://your-frontend.vercel.app` (The URL where your Vercel app is live)
- `MONGODB_URI`: Ensure your Render IP is whitelisted in MongoDB Atlas.

### Frontend (Vercel)
- `NEXTAUTH_URL`: `https://your-frontend.vercel.app` (Matching your actual domain)
- `NEXT_PUBLIC_API_URL`: `https://your-backend.onrender.com/api`
- `NEXT_PUBLIC_SOCKET_URL`: `https://your-backend.onrender.com`

---

## What is included
- Google login (via NextAuth)
- Premium Dashboard
- Room creation & Sync
- Real-time Chat
- YouTube & Local Sync
- Google login
- dashboard
- create room page
- room join page
- chat
- simple playback state sync

## Next recommended upgrades
- host-only controls
- persistent chat storage
- YouTube iframe sync adapter
- browser extension for OTT sync
- friends/invites

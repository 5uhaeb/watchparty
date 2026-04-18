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
  apps/
    web/
    server/
  packages/
    shared/
```

## Run locally

### 1. Backend
```bash
cd apps/server
npm install
cp .env.example .env
npm run dev
```

### 2. Frontend
```bash
cd apps/web
npm install
cp .env.example .env.local
npm run dev
```

## Environment setup

### Backend `.env`
```env
PORT=5000
CLIENT_URL=http://localhost:3000
MONGODB_URI=your_mongodb_atlas_uri
JWT_SECRET=replace_me
```

### Frontend `.env.local`
```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace_me
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
```

## Vercel + Render deployment
- Deploy `apps/web` to Vercel
- Deploy `apps/server` to Render
- Point the frontend env vars to your Render backend URL
- Allow CORS for the frontend URL in backend env

## What is included
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

FROM node:20-bookworm-slim

ENV NODE_ENV=production

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/src ./src

EXPOSE 10000

CMD ["node", "src/server.js"]

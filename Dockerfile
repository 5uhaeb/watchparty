FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=10000

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/src ./src
USER node

EXPOSE 10000

CMD ["node", "src/server.js"]

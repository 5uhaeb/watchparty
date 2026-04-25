FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends janus nginx gettext-base ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && rm -f /etc/nginx/sites-enabled/default

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/src ./src

COPY audio-server/janus.jcfg /etc/janus/janus.jcfg
COPY audio-server/janus.transport.websockets.jcfg /etc/janus/templates/janus.transport.websockets.jcfg.template
COPY audio-server/janus.plugin.audiobridge.jcfg /etc/janus/janus.plugin.audiobridge.jcfg
COPY deploy/render-single/nginx.conf.template /etc/nginx/templates/watchparty.conf.template
COPY deploy/render-single/start.sh /usr/local/bin/start-watchparty

RUN chmod +x /usr/local/bin/start-watchparty

EXPOSE 10000

CMD ["start-watchparty"]

FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends janus ca-certificates gettext-base \
  && rm -rf /var/lib/apt/lists/*

COPY janus.jcfg /etc/janus/janus.jcfg
COPY janus.transport.websockets.jcfg /etc/janus/templates/janus.transport.websockets.jcfg.template
COPY janus.plugin.audiobridge.jcfg /etc/janus/janus.plugin.audiobridge.jcfg
COPY start-render.sh /usr/local/bin/start-janus-render

RUN chmod +x /usr/local/bin/start-janus-render

EXPOSE 8188
EXPOSE 20000-20100/udp

CMD ["start-janus-render"]

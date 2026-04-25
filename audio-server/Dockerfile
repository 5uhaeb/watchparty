FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends janus ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY janus.jcfg /etc/janus/janus.jcfg
COPY janus.transport.websockets.jcfg /etc/janus/janus.transport.websockets.jcfg
COPY janus.plugin.audiobridge.jcfg /etc/janus/janus.plugin.audiobridge.jcfg

EXPOSE 8188
EXPOSE 20000-20100/udp

CMD ["janus", "-F", "/etc/janus"]

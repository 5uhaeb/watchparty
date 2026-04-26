#!/bin/sh
set -eu

JANUS_WS_PORT="${PORT:-8188}"
JANUS_PUBLIC_IP="${JANUS_PUBLIC_IP:-}"
export JANUS_WS_PORT
export JANUS_PUBLIC_IP

envsubst '$JANUS_WS_PORT' \
  < /etc/janus/templates/janus.transport.websockets.jcfg.template \
  > /etc/janus/janus.transport.websockets.jcfg

envsubst '$JANUS_PUBLIC_IP' \
  < /etc/janus/templates/janus.jcfg.template \
  > /etc/janus/janus.jcfg

if [ -z "$JANUS_PUBLIC_IP" ] || [ "$JANUS_PUBLIC_IP" = "0.0.0.0" ]; then
  sed -i '/nat_1_1_mapping/d' /etc/janus/janus.jcfg
fi

exec janus -F /etc/janus

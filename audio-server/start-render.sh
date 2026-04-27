#!/bin/sh
set -eu

RENDER_PORT="${PORT:-8080}"
JANUS_INTERNAL_WS_PORT="${JANUS_INTERNAL_WS_PORT:-8188}"
JANUS_PUBLIC_IP="${JANUS_PUBLIC_IP:-}"
export RENDER_PORT
export JANUS_INTERNAL_WS_PORT
export JANUS_PUBLIC_IP

envsubst '$JANUS_INTERNAL_WS_PORT' \
  < /etc/janus/templates/janus.transport.websockets.jcfg.template \
  > /etc/janus/janus.transport.websockets.jcfg

envsubst '$JANUS_PUBLIC_IP' \
  < /etc/janus/templates/janus.jcfg.template \
  > /etc/janus/janus.jcfg

if [ -z "$JANUS_PUBLIC_IP" ] || [ "$JANUS_PUBLIC_IP" = "0.0.0.0" ]; then
  sed -i '/nat_1_1_mapping/d' /etc/janus/janus.jcfg
fi

envsubst '$RENDER_PORT $JANUS_INTERNAL_WS_PORT' \
  < /etc/nginx/templates/watchparty-janus.conf.template \
  > /etc/nginx/conf.d/default.conf

janus -F /etc/janus &
JANUS_PID="$!"

trap 'kill "$JANUS_PID" 2>/dev/null || true' INT TERM

nginx -g 'daemon off;' &
NGINX_PID="$!"

wait "$NGINX_PID"

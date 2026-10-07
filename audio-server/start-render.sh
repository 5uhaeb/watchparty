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

nginx -g 'daemon off;' &
NGINX_PID="$!"

cleanup() {
  kill "$JANUS_PID" "$NGINX_PID" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' INT TERM

# Stop the container if either service fails, rather than leaving a healthy-looking
# nginx endpoint after Janus has exited.
while kill -0 "$JANUS_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 2
done
exit 1

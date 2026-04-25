#!/bin/sh
set -eu

PUBLIC_PORT="${PORT:-10000}"
BACKEND_PORT="${BACKEND_PORT:-5000}"
export PUBLIC_PORT BACKEND_PORT

envsubst '$PUBLIC_PORT $BACKEND_PORT' \
  < /etc/nginx/templates/watchparty.conf.template \
  > /etc/nginx/conf.d/default.conf

PORT="$BACKEND_PORT" node /app/backend/src/server.js &
BACKEND_PID="$!"

janus -F /etc/janus &
JANUS_PID="$!"

nginx -g 'daemon off;' &
NGINX_PID="$!"

trap 'kill "$BACKEND_PID" "$JANUS_PID" "$NGINX_PID" 2>/dev/null || true' INT TERM

wait "$NGINX_PID"

#!/bin/sh
set -eu

JANUS_WS_PORT="${PORT:-8188}"
export JANUS_WS_PORT

envsubst '$JANUS_WS_PORT' \
  < /etc/janus/templates/janus.transport.websockets.jcfg.template \
  > /etc/janus/janus.transport.websockets.jcfg

exec janus -F /etc/janus

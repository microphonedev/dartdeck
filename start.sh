#!/bin/bash
cd "$(dirname "$0")"
export HOST_HINT="${HOST_HINT:-pikado.lan}"
export PORT="${PORT:-80}"
if [ "$PORT" = "80" ] && [ "$(id -u)" -ne 0 ]; then
  echo "Port 80 needs root. Run: sudo ./start.sh"
  echo "Or: PORT=3000 ./start.sh"
  exit 1
fi
exec node server.js
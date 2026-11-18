#!/bin/bash
# Un solo contenedor corre la API y el worker (motor de turnos, cola de envíos y lectura de Telegram).
# Si cualquiera de los dos se cae, el contenedor termina y Render lo reinicia.
node apps/worker/dist/main.js &
WORKER=$!
node apps/api/dist/src/main.js &
API=$!
trap 'kill "$WORKER" "$API" 2>/dev/null' TERM INT
wait -n "$WORKER" "$API"
STATUS=$?
kill "$WORKER" "$API" 2>/dev/null
exit "$STATUS"

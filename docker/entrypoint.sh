#!/bin/sh
# brandmint web | worker
set -e
mkdir -p /data/storage
cd /app/web
case "$1" in
  web)
    npx drizzle-kit push --force >/dev/null
    npx tsx scripts/seed.ts
    exec npx next start -p 3000 -H 0.0.0.0
    ;;
  worker)
    # wait for the web container to create the schema
    i=0; until [ -f /data/brandmint.db ] || [ $i -ge 60 ]; do sleep 2; i=$((i+1)); done
    sleep 5
    exec npx tsx scripts/worker.ts
    ;;
  *) exec "$@" ;;
esac

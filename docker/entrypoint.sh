#!/bin/sh
# brandmint web | worker
set -e
mkdir -p /data/storage
cd /app/web
DB_FILE="${DATABASE_URL#file:}"
case "$1" in
  web)
    if [ ! -f "$DB_FILE" ]; then
      # brand-new install only: create every table from the schema.
      # Existing databases are upgraded by the additive migrations in src/db/index.ts,
      # never by drizzle-kit push (its --force mode can empty tables).
      npx drizzle-kit push --force >/dev/null
    else
      cp "$DB_FILE" "$(dirname "$DB_FILE")/pre-start-backup.db"
    fi
    npx tsx scripts/seed.ts
    exec npx next start -p 3000 -H 0.0.0.0
    ;;
  worker)
    i=0; until [ -f "$DB_FILE" ] || [ $i -ge 60 ]; do sleep 2; i=$((i+1)); done
    sleep 5
    exec npx tsx scripts/worker.ts
    ;;
  *) exec "$@" ;;
esac

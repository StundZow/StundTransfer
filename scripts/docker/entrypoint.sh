#!/bin/sh

# Copy default logo to the frontend public folder if it doesn't exist
cp -rn /tmp/img/* /opt/app/frontend/public/img

if [ "$CADDY_DISABLED" != "true" ]; then
  # Start Caddy
  echo "Starting Caddy..."
  if [ "$TRUST_PROXY" = "true" ]; then
    caddy start --adapter caddyfile --config /opt/app/reverse-proxy/Caddyfile.trust-proxy &
  else
    caddy start --adapter caddyfile --config /opt/app/reverse-proxy/Caddyfile &
  fi
else
  echo "Caddy is disabled. Skipping..."
fi

# Run the frontend server
PORT=3333 HOSTNAME=0.0.0.0 node frontend/server.js &

# StundTransfer: a copy of the database at every start, before the migrations
# (automatic updates included); the 10 most recent copies are kept
if [ -f backend/data/pingvin-share.db ]; then
  mkdir -p backend/data/backups-auto
  cp backend/data/pingvin-share.db "backend/data/backups-auto/pingvin-share-$(date +%Y-%m-%d_%H-%M-%S).db"
  ls -1t backend/data/backups-auto/pingvin-share-*.db | tail -n +11 | while read -r old; do rm -f "$old"; done
fi

# Run the backend server
cd backend && ./node_modules/.bin/prisma migrate deploy && node dist/prisma/seed/config.seed.js && node dist/src/main

# Wait for all processes to finish
wait -n

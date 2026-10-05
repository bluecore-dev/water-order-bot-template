#!/usr/bin/env bash
# Build & (re)start on the VPS. Run from the repository checkout on the server:
#   bash deploy/deploy.sh
# Touches only this project's process (PM2_APP_NAME), never other PM2 apps.
set -euo pipefail

cd "$(dirname "$0")/../backend"
[ -f .env ] || { echo "backend/.env is missing"; exit 1; }
grep -q '^NODE_ENV=production' .env || { echo "backend/.env must have NODE_ENV=production"; exit 1; }

APP_NAME="${PM2_APP_NAME:-$(grep -E '^PM2_APP_NAME=' .env | cut -d= -f2 || true)}"
APP_NAME="${APP_NAME:-water-order-bot}"
export PM2_APP_NAME="$APP_NAME"

npm ci --no-audit --no-fund
npx prisma generate
npx prisma migrate deploy
npm run build

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload "$APP_NAME" --update-env
else
  pm2 start ecosystem.config.js
fi

sleep 5
PORT="$(grep -E '^PORT=' .env | cut -d= -f2)"
curl -fsS "http://127.0.0.1:${PORT:-3020}/api/health" && echo && echo "Deployed $APP_NAME"

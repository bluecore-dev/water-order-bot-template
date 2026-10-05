#!/usr/bin/env bash
# Ship the local working tree to the server and run deploy.sh there.
#
#   DEPLOY_HOST=root@1.2.3.4 DEPLOY_DIR=/var/www/my-water-bot bash deploy/push.sh
#
# Server-only files are never touched: backend/.env, backend/uploads, node_modules.
set -euo pipefail

: "${DEPLOY_HOST:?set DEPLOY_HOST, e.g. root@1.2.3.4}"
: "${DEPLOY_DIR:?set DEPLOY_DIR, e.g. /var/www/my-water-bot}"
[[ "$DEPLOY_DIR" =~ ^/var/www/[a-z0-9][a-z0-9_-]+$ ]] || { echo "DEPLOY_DIR must be /var/www/<name>"; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# rsync --delete must only ever run against a fresh dir (nothing but backend/.env, prepared
# on first install) or a previous copy of THIS project.
ssh "$DEPLOY_HOST" "d='$DEPLOY_DIR'; [ ! -e \"\$d\" ] \
  || [ -z \"\$(find \"\$d\" -mindepth 1 ! -path \"\$d/backend\" ! -path \"\$d/backend/.env\" | head -1)\" ] \
  || grep -q '\"water-order-backend\"' \"\$d/backend/package.json\"" \
  || { echo "Refusing: $DEPLOY_DIR exists and is not this project"; exit 1; }

rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .git \
  --exclude 'backend/.env' --exclude 'backend/uploads/' --exclude 'backend/test/.uploads/' \
  --exclude '*.log' --exclude .DS_Store \
  "$ROOT/" "$DEPLOY_HOST:$DEPLOY_DIR/"

ssh "$DEPLOY_HOST" "cd '$DEPLOY_DIR' && bash deploy/deploy.sh"

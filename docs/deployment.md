# Deployment (Ubuntu VPS)

Target: one Node.js process under PM2, PostgreSQL on the same server, optional Nginx + HTTPS.

```
Internet ──► Nginx (only for webhook / OAuth) ──► 127.0.0.1:<PORT> NestJS ──► PostgreSQL
                                                         ├──► Telegram (polling or webhook)
                                                         └──► amoCRM
```

**Polling mode needs no domain and no Nginx.** A domain (`api.example.com` or a subdomain of an
existing client domain) is needed only for `BOT_MODE=webhook` or amoCRM OAuth. With a long-lived
amoCRM token and polling, the bot runs without any public endpoint.

## Shared-server rules

The VPS hosts other projects. This deployment must not affect them:

- its own directory (`/var/www/<project>`), PM2 name (`PM2_APP_NAME`), port, database and DB role;
- check the port is free first: `ss -ltnp | grep :<PORT>`;
- its own Nginx file in `sites-available/`. Never edit other sites. Always `nginx -t` before reload;
- never `pm2 restart all` / `pm2 delete all`. Manage only this app by name;
- one bot token = one polling process (stop local runs while the server polls).

## First install

```bash
# 1. Database (own role + database)
sudo -u postgres psql -c "CREATE ROLE water_bot LOGIN PASSWORD '<strong-password>';"
sudo -u postgres psql -c "CREATE DATABASE water_bot OWNER water_bot;"

# 2. Code
sudo mkdir -p /var/www/my-water-bot && sudo chown $USER /var/www/my-water-bot
git clone <repo> /var/www/my-water-bot   # or rsync the repository
cd /var/www/my-water-bot/backend

# 3. Environment
cp .env.example .env && chmod 600 .env
#   NODE_ENV=production, PORT=<free port>, DATABASE_URL=…water_bot…,
#   APP_SECRET=$(openssl rand -hex 32), ENCRYPTION_KEY=$(openssl rand -base64 32),
#   BOT_TOKEN, ADMIN_TELEGRAM_IDS, SWAGGER_ENABLED=false, PM2_APP_NAME=my-water-bot

# 4. Build, migrate, start
bash ../deploy/deploy.sh
pm2 save            # persist the process list (after checking `pm2 ls`)
```

`deploy.sh` runs `npm ci → prisma generate → prisma migrate deploy → build`, then
`pm2 reload <name>` (or the first `pm2 start`), and finishes with a health check.

### Updates

From the local repository (rsync of the working tree, then `deploy.sh` on the server):

```bash
DEPLOY_HOST=root@<server> DEPLOY_DIR=/var/www/my-water-bot bash deploy/push.sh
```

`push.sh` refuses to sync into a directory that is not empty and not a previous copy of this
project, and never overwrites `backend/.env`, `backend/uploads/` or `node_modules`. With a git
remote, `git pull && bash deploy/deploy.sh` on the server works too.

Migrations are applied with `prisma migrate deploy`. It only runs committed migrations and never
resets data. Write migrations to be additive (new nullable columns or defaults) so that a
rollback of the code keeps working.

## Webhook mode / OAuth (optional)

1. DNS: `api.example.com` → VPS.
2. Copy `deploy/nginx.conf.example` to `/etc/nginx/sites-available/my-water-bot`, set
   `server_name` and the port, symlink into `sites-enabled`, run `nginx -t && systemctl reload nginx`.
3. `certbot --nginx -d api.example.com`
4. `.env`: `API_URL=https://api.example.com`, `BOT_MODE=webhook`,
   `BOT_WEBHOOK_SECRET=$(openssl rand -hex 24)`, then deploy. The webhook is registered on startup.

## Going live with the client's bot (cut-over checklist)

1. ☐ Client's bot created in @BotFather (name, description, avatar).
2. ☐ `npm run data:clear-test` (dry run), then `npm run data:clear-test -- --yes`.
3. ☐ `.env`: client `BOT_TOKEN`, client `ADMIN_TELEGRAM_IDS`, amoCRM credentials and ids.
4. ☐ `bash deploy/deploy.sh`, then `pm2 logs my-water-bot --lines 50` shows `Bot connected` with the client's username.
5. ☐ In the bot: `⚙️ Boshqaruv → ⚙️ Sozlamalar`: company name, phone, Telegram, working hours,
   payment note (`Yetkazib berish — bepul. …`), **Minimal buyurtma = 2**,
   **Shikastlangan idish jarimasi = 40000**. These are database settings, so they don't carry
   over from a local database.
6. ☐ Products and prices checked, photos uploaded.
7. ☐ `🔗 amoCRM → 🔍 Ulanishni tekshirish` shows ✅. Place one real test order and check it in amoCRM, then cancel it there.
8. ☐ The old test bot is no longer polled anywhere.

## Operations

- Logs: `pm2 logs my-water-bot` (JSON). Secrets are redacted.
- Health: `curl -s http://127.0.0.1:<PORT>/api/health`
- Backups: `pg_dump -Fc water_bot > /var/backups/water_bot-$(date +%F).dump` (daily cron
  recommended), plus `backend/uploads/` (product photos).
- amoCRM queue: `⚙️ Boshqaruv → 📊 Statistika` / `🔗 amoCRM`.

## Docker alternative

```bash
docker compose --profile full up -d --build   # PostgreSQL + backend, migrations run on start
```

The image runs as a non-root user. Uploads and DB data live in named volumes.

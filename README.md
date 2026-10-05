# Water Order System

> 🇺🇿 **O‘zbekcha:** [README.uz.md](README.uz.md) — bot nima qiladi, qanday ishlaydi va yangi mijoz uchun qanday o‘rnatiladi.

A Telegram ordering bot for a drinking-water delivery business (e.g. 18.9 L bottled water), with an
in-bot admin mode and amoCRM integration.

- **Customers** order 18.9 L water in a regular Telegram bot (no Mini App): pick products and
  quantity, say how many empty bottles they return, share their phone and address, confirm.
- **Admins** manage products, prices, photos and contact settings **inside the same bot**
  (`⚙️ Boshqaruv`), and can **broadcast news/discounts** to all customers. There is no separate
  web panel. See [docs/architecture.md](docs/architecture.md#decisions).
- People who open the bot but don't order get **one daytime reminder** with an order button.
- A shared **location is turned into a street/district name** (OpenStreetMap, or Yandex with a key).
- **amoCRM** gets every order (contact found or created by phone, lead with the order, full note).
  If amoCRM is down, orders are kept locally and retried. Nothing is lost.

The code is client-agnostic. Company name, contacts, products and prices live in the database, and
the bot token and amoCRM ids live in `.env`. **Moving from the test bot to the client's bot only
means changing `BOT_TOKEN`.**

```
Customer ──► Telegram ──► NestJS backend (bot + sync worker) ──► PostgreSQL
                                   │
                                   └──► amoCRM API (outbox, retries)
```

## Stack

NestJS 11 · TypeScript · Prisma 6 · PostgreSQL · grammY · pino · Jest

## Repository layout

```
water-order-system/
├── backend/
│   ├── src/
│   │   ├── main.ts, app.module.ts, app.setup.ts
│   │   ├── config/            env validation (zod) + typed config
│   │   ├── database/          PrismaService
│   │   ├── i18n/              bot texts (uz; ru/en can be added later)
│   │   ├── bot/               grammY bot
│   │   │   ├── handlers/      start, product, order, history, profile, addresses, admin/*
│   │   │   ├── conversations/ catalog + checkout state machines
│   │   │   ├── keyboards/ middlewares/ services/ session/
│   │   ├── modules/           users, products, orders, addresses, settings, admins, stats, storage, health
│   │   ├── integrations/amocrm/  OAuth/long-lived auth, API client, payloads, sync worker
│   │   └── common/            errors, events, filters, logging, utils
│   ├── prisma/                schema.prisma + migrations
│   ├── scripts/               seed-demo, amocrm-inspect, clear-test-data, test-db guard
│   ├── test/                  unit + integration tests (real DB, fake Telegram, fake amoCRM)
│   ├── Dockerfile, ecosystem.config.js, .env.example
├── deploy/                    deploy.sh, nginx.conf.example
├── docs/                      architecture, bot flow, API, amoCRM, deployment, admin guide (uz)
└── docker-compose.yml
```

## Local development

Requirements: Node.js 20+ and PostgreSQL 14+ (local, or `docker compose up -d`).

```bash
cd backend
cp .env.example .env          # fill DATABASE_URL, APP_SECRET, BOT_TOKEN, ADMIN_TELEGRAM_IDS
npm install
npx prisma migrate dev        # create/upgrade the schema
npm run seed:demo -- --company "Toza Suv"   # optional: one demo product
npm run dev                   # http://localhost:3020/api/health, docs at /api/docs
```

Open the bot in Telegram and send `/start`. If your Telegram id is in `ADMIN_TELEGRAM_IDS`, a
`⚙️ Boshqaruv` button appears.

> ⚠️ A bot token can be **polled by one process only**. If the same token runs on a server,
> stop it there before running locally, or both processes get `409 Conflict` and stop receiving updates.

### Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start with watch mode |
| `npm run build && npm start` | Production build and run |
| `npm test` | Migrate the `*_test` database and run all tests |
| `npx prisma migrate dev` | Create/apply a migration in development |
| `npx prisma migrate deploy` | Apply migrations in production |
| `npx prisma generate` | Regenerate the Prisma client |
| `npx prisma studio` | Browse the database |
| `npm run amocrm:inspect` | Print amoCRM pipelines, statuses, users and field ids for `.env` |
| `npm run data:clear-test -- --yes` | Delete test orders/users before go-live (keeps products and settings) |

## Tests

`npm test` runs 104 tests: unit tests (pricing, phone, crypto, payloads, env) and integration
tests against a real PostgreSQL test database. Those cover order creation and price snapshots,
idempotency, the amoCRM worker against a fake amoCRM (success, failure, retry, no duplicates,
token refresh), and **complete bot conversations** driven through grammY with a fake Telegram API.

Tests refuse to run unless the database name ends with `_test` (see `test/test.env`).

## New client from this template

1. On GitHub use **Use this template** (or clone) and create a private repo for the client.
2. Client: create a bot in @BotFather and send the token. You also need their Telegram id
   (for admin access) and amoCRM details when they use amoCRM.
3. Server: create its own database/role, directory, port and PM2 name
   ([docs/deployment.md](docs/deployment.md)). Then `cp backend/.env.example backend/.env`,
   fill it in, and run `bash deploy/deploy.sh`.
4. In the bot (`⚙️ Boshqaruv`): company name, contacts, working hours, payment note, minimum
   order, damaged-bottle fine, products, prices and photos.
5. amoCRM: put the token/domain in `.env`, run `npm run amocrm:inspect`, fill in the pipeline
   and field ids, and redeploy.

Nothing client-specific lives in the code. Texts are in `backend/src/i18n/uz.ts` if wording
needs to change.

## Switching to the client's bot

1. Client creates the bot in @BotFather and sends the token.
2. `npm run data:clear-test -- --yes` removes test orders and users so they never reach the client's amoCRM.
3. Put the new token in `BOT_TOKEN`, set the client's admins in `ADMIN_TELEGRAM_IDS`, restart.
4. Product photos are re-uploaded to the new bot automatically on first view (file ids are bot-specific).

Details: [docs/deployment.md](docs/deployment.md).

## Documentation

- [Architecture & decisions](docs/architecture.md)
- [Bot flow](docs/bot-flow.md)
- [HTTP API](docs/api.md)
- [amoCRM integration](docs/amocrm.md)
- [Deployment (VPS)](docs/deployment.md)
- [Admin qo‘llanmasi (o‘zbekcha, mijoz uchun)](docs/admin-guide.uz.md)

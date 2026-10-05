# Architecture

## Overview

A **modular monolith**: one Node.js process hosts the Telegram bot, the amoCRM sync worker and a
small HTTP surface. PostgreSQL is the source of truth, and amoCRM is a synchronization destination.

```
                 ┌──────────────────────── NestJS process ────────────────────────┐
Telegram ◄──────►│ BotModule (grammY)                                             │
 (polling or     │   middlewares: private-only → rate-limit → session → user/admin│
  webhook)       │   handlers ──► conversations (catalog, checkout)               │
                 │        │                                                       │
                 │        ▼                                                       │
                 │ Domain modules: products, orders(+pricing), users, addresses,  │
                 │                 settings, admins, stats, storage               │──► PostgreSQL
                 │        │ order.created (event)                                 │
                 │        ▼                                                       │
                 │ AmocrmModule: sync worker (outbox) → API client → auth ────────┼──► amoCRM API
                 │ HTTP: /api/health · /api/telegram/webhook · /api/amocrm/oauth  │
                 └────────────────────────────────────────────────────────────────┘
```

The bot never talks to amoCRM. Handlers call domain services, `OrdersService` writes the order
together with its outbox rows, and the sync worker delivers them.

## Decisions

Decisions that differ from, or refine, the original specification:

| # | Decision | Why |
|---|---|---|
| D1 | **No React admin panel. Admin mode lives inside the bot** (agreed with the product owner 2026-10-05). | 1–3 products whose price changes a few times a year don't justify a second app, a subdomain, a login system and its attack surface. Operators work in amoCRM. Photos are easiest to upload in Telegram. The domain services are UI-agnostic, so a web panel can be added later without touching business logic. |
| D2 | Admin identity = Telegram user id. `ADMIN_TELEGRAM_IDS` are super admins, and the `AdminUser` table holds admins added from the bot. JWT / email-password auth was dropped with the web panel. | Telegram sets `from.id` server-side, so clients cannot forge it. Roles `SUPER_ADMIN` / `ADMIN` are kept: only super admins manage admins. |
| D3 | No public REST CRUD API. HTTP exposes only health, the Telegram webhook and the amoCRM OAuth callback. Swagger documents those. | Without a web panel the CRUD endpoints would have no client. Less surface means less risk. |
| D4 | The bot runs **inside** the backend process and calls services directly. | Fewer moving parts. The specification allows "API / internal service". |
| D5 | Bot session (cart, current step) is stored in PostgreSQL (`BotSession`). There is no Redis. | Survives restarts, and nothing extra to operate. |
| D6 | amoCRM delivery uses a **transactional outbox** (`AmocrmSync`, one row per order per step: CONTACT → LEAD → NOTE) and a 60 s worker with backoff. | An order can never exist without its pending sync, and retries can't duplicate contacts or leads (see [amocrm.md](amocrm.md)). |
| D7 | Money is stored as integer so‘m (`Int`). | UZS has no minor unit in circulation. Integers avoid float errors. |
| D8 | Product images: `Product.imageUrl` holds a storage reference (`local:products/<uuid>.jpg`). The Telegram `file_id` is cached together with the owning bot id. | `file_id`s are bot-specific. After a token switch the image is re-uploaded from storage. The storage provider interface allows S3/Cloudinary later. |
| D9 | Saved phone is reused silently at checkout. The address is always asked, with saved addresses one tap away. | Fewest steps without risking a delivery to the wrong address. |
| D10 | `Order.idempotencyKey` (one per checkout) plus a 12 h checkout expiry. | A double tap or a stale "Confirm" button never creates a second order. |
| D11 | Additions to the schema: `BotSession`, `IntegrationToken`, `User.language`, `Order.customerName`, `Order.idempotencyKey`, `Product.imageFileId/imageFileBotId`, `AmocrmSync.attempts/nextAttemptAt/lastAttemptAt`, `AdminUser.telegramId` (instead of email/password). | Required by D2, D5, D6, D8 and D10. |
| D12 | The UI is Uzbek only, with a typed locale structure (`src/i18n`). | Russian/English: add `ru.ts` implementing `Messages`. The compiler enforces completeness. |

## Data model

```
User 1─* Address
User 1─* Order 1─* OrderItem *─1 Product        (OrderItem keeps name + unitPrice snapshot)
Order 1─* AmocrmSync                              (CONTACT, LEAD, NOTE)
AdminUser, Setting, IntegrationToken, BotSession  (standalone)
```

Key rules:

- **Historical prices never change.** `OrderItem.productNameSnapshot`, `unitPrice` and `subtotal`
  are copied at order time. History screens and amoCRM notes read only the snapshot.
- **The backend calculates totals.** `priceOrder()` (`modules/orders/pricing.ts`) is the only
  place money is computed, and only from DB prices. When the summary is shown, its total is
  remembered. If prices change before confirmation, the customer sees a fresh summary
  (`PRICE_CHANGED`).
- **Order numbers** come from a PostgreSQL sequence starting at **#1001**.
- **Client pricing rules are settings, not code.** For example, one client has free delivery,
  no bottle deposit, a minimum order of 2 items (`min_order_quantity`, checked in
  `priceOrder`), and a 40 000 so‘m fine for a damaged returned bottle that the courier collects
  (`damaged_bottle_fine`). The fine is shown to the customer but is not part of the order
  total. Another client changes these values in `⚙️ Sozlamalar`, with no code change.
- Products referenced by orders cannot be deleted, only deactivated.

Statuses (`OrderStatus` enum, single source in `modules/orders/order-status.ts`):
`NEW → CONFIRMED → PROCESSING → ASSIGNED → DELIVERING → DELIVERED`, or `CANCELLED`. The bot sets
`NEW`. Later statuses belong to amoCRM. Mirroring them back (amoCRM webhook) is a possible next step.

## Security

- All secrets are in env, validated at startup (zod). The app refuses to start when misconfigured.
  Errors name variables, never values.
- amoCRM tokens are encrypted at rest (AES-256-GCM, `ENCRYPTION_KEY`). The client secret is only
  sent to the configured `AMOCRM_DOMAIN`, never to a domain taken from a request.
- The OAuth `state` is HMAC-signed, valid for 15 minutes and bound to the admin who started it.
- Telegram webhook requests are verified with `X-Telegram-Bot-Api-Secret-Token`.
- Logs: pino with header redaction, query strings stripped, and every message passed through
  `redactSecrets()` (bot tokens, bearer tokens, OAuth secrets).
- HTTP: helmet headers, CORS disabled (no browser clients), global rate limit. Validation pipe
  uses whitelist mode.
- Bot: private chats only, per-user flood limit, admin role re-checked on every update,
  ownership checks on orders and addresses, HTML-escaping of all user/admin text.

## Scaling notes

Run **one** instance per bot token. Polling allows a single consumer, and the rate limiter and
the sync worker's in-flight set are in-process. The outbox claim (`updateMany … where status &
updatedAt`) is already safe for multiple workers. To scale out you would switch to webhook mode
and move the rate limiter to shared storage.

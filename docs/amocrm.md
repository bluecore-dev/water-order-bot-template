# amoCRM integration

Only the backend talks to amoCRM. Credentials never reach Telegram or any frontend.

## What gets created per order

1. **Contact**: found by phone (last 9 digits, comparing every stored PHONE value), otherwise
   created with the customer's name and phone. Repeat customers attach to the same contact.
2. **Lead**: `Buyurtma #1042`, `price` = order total, linked to the contact, in the configured
   pipeline/status, optional responsible user and tags, and optional custom fields.
3. **Note** on the lead: full order (items with snapshot prices, empty bottles, total, customer,
   phone, address with the place name, Yandex map link, exact coordinates, Telegram
   id/username). Operators see everything even with no custom fields configured.

The amoCRM ids are stored on the order (`amocrmContactId`, `amocrmLeadId`) and on each
`AmocrmSync` row.

## Setup

### 1. Choose authentication

**A. Long-lived token (recommended, simplest).** In amoCRM: *Settings → Integrations → Create
integration → private*, then generate a long-lived token. Set:

```
AMOCRM_DOMAIN=company.amocrm.ru
AMOCRM_LONG_LIVED_TOKEN=<token>
```

**B. OAuth2.** Create the integration with redirect URI
`https://<api-domain>/api/amocrm/oauth/callback`. Set `AMOCRM_DOMAIN`, `AMOCRM_CLIENT_ID`,
`AMOCRM_CLIENT_SECRET`, `AMOCRM_REDIRECT_URI` and `ENCRYPTION_KEY`, restart, then in the bot:
`⚙️ Boshqaruv → 🔗 amoCRM → 🔗 amoCRM’ni ulash`. Tokens are refreshed automatically. amoCRM
rotates the refresh token on every refresh, and concurrent refreshes are collapsed into one
request. If the refresh token is revoked, admins get a Telegram alert and must reconnect.

### 2. Find ids and map fields

```bash
npm run amocrm:inspect
```

This prints pipelines with statuses, users, and lead/contact custom fields. Fill as needed:

```
AMOCRM_PIPELINE_ID=…        AMOCRM_STATUS_ID=…        AMOCRM_RESPONSIBLE_USER_ID=…
AMOCRM_LEAD_TAGS=telegram-bot
AMOCRM_LEAD_FIELD_ADDRESS=…        AMOCRM_LEAD_FIELD_EMPTY_BOTTLES=…
AMOCRM_LEAD_FIELD_PRODUCTS=…       AMOCRM_LEAD_FIELD_QUANTITY=…
AMOCRM_LEAD_FIELD_ORDER_NUMBER=…   AMOCRM_LEAD_FIELD_TOTAL=…
AMOCRM_LEAD_FIELD_PHONE=…          AMOCRM_LEAD_FIELD_CUSTOMER_NAME=…
AMOCRM_LEAD_FIELD_MAP_LINK=…       AMOCRM_LEAD_FIELD_TELEGRAM_ID=…
AMOCRM_CONTACT_FIELD_TELEGRAM=…
```

Unset fields are skipped. Numbers are sent to `numeric` fields, text to everything else.
Restart after changing env. Check with `⚙️ Boshqaruv → 🔗 amoCRM → 🔍 Ulanishni tekshirish`.

> Before connecting the client's amoCRM, run `npm run data:clear-test -- --yes`. Orders created
> while amoCRM was not configured stay queued and **would be sent** as soon as it is.

## Reliability

```
order saved + 3 outbox rows (one transaction) ─► immediate attempt ─► worker every 60 s
```

- **Steps never repeat.** A failed LEAD step is retried later, but CONTACT is not redone. Ids
  are saved after every step.
- **Backoff**: 1, 2, 5, 10, 30, 60, 120, 240, 480, 720 minutes. After
  `AMOCRM_SYNC_MAX_ATTEMPTS` (10) automatic retries stop. Admins are alerted at the 3rd and the
  final attempt, and can resend from `📋 Buyurtmalar` or `🔗 amoCRM → 🔁 Xatolarni qayta yuborish`.
- **Credential problems** (not connected, revoked token) do **not** consume attempts. Orders
  wait and retry every 5 minutes. Admins get at most one alert per hour.
- **Crash safety.** Rows stuck in `PROCESSING` for more than 10 minutes are re-queued. If a
  crash happened after amoCRM created the lead but before the id was saved, the retry first
  searches for a lead named `Buyurtma #<n>`, so no duplicate is created.
- The customer's confirmation never waits for amoCRM.
- `AMOCRM_SYNC_ENABLED=false` pauses delivery. Orders keep queueing.

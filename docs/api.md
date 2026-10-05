# HTTP API

The backend has a deliberately small HTTP surface (see decision D3 in
[architecture.md](architecture.md#decisions)): customers and admins use Telegram, and there is
no web client. Swagger UI: `GET /api/docs` (when `SWAGGER_ENABLED=true`).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | public | Liveness/readiness for monitors and `deploy.sh` |
| POST | `/api/telegram/webhook` | Telegram secret header | Bot updates in `BOT_MODE=webhook` |
| GET | `/api/amocrm/oauth/callback` | signed `state` | amoCRM OAuth2 redirect URI |
| GET | `/api/docs` | public (disable in prod) | Swagger UI |

## GET /api/health

```json
200 { "status": "ok", "database": "up", "bot": "running" }
503 { "status": "degraded", "database": "down", "bot": "error" }
```

`bot` is one of `running`, `disabled`, `starting`, `error`, `stopped`. The response contains no
counts, versions or configuration.

## POST /api/telegram/webhook

Registered automatically on startup in webhook mode (`setWebhook` to
`${API_URL}/api/telegram/webhook` with `secret_token = BOT_WEBHOOK_SECRET`). Requests without the
matching `X-Telegram-Bot-Api-Secret-Token` header are rejected. In polling mode the endpoint
returns 404.

## GET /api/amocrm/oauth/callback

Target of the amoCRM consent page. Query: `code`, `state`, `referer` (account domain), or
`error`. The `state` must be a valid, unexpired token issued by the bot's
`🔗 amoCRM’ni ulash` button, and `referer` must equal `AMOCRM_DOMAIN`. On success tokens are
stored encrypted and the admin gets a Telegram message. The response is a small HTML page.

## Errors

All errors use one envelope:

```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Cannot GET /api/x" } }
```

Rate limit: 60 requests/minute per IP (the webhook is exempt).

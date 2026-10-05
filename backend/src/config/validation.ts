import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const optionalString = z.preprocess(emptyToUndefined, z.string().trim().optional());
const optionalInt = z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional());
const bool = (def: boolean) =>
  z.preprocess(
    (v) => (v === undefined || v === '' ? def : v),
    z.union([z.boolean(), z.enum(['true', 'false', '1', '0'])]).transform((v) => v === true || v === 'true' || v === '1'),
  );

/** Comma-separated list of Telegram numeric ids. */
const telegramIdList = z.preprocess(
  (v) => (typeof v === 'string' ? v : ''),
  z
    .string()
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().regex(/^\d{3,20}$/, 'ADMIN_TELEGRAM_IDS must contain numeric Telegram ids'))),
);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3020),
    // 127.0.0.1 behind nginx; 0.0.0.0 inside Docker.
    HOST: z.string().default('127.0.0.1'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    APP_TIMEZONE: z.string().default('Asia/Tashkent'),
    API_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
    SWAGGER_ENABLED: bool(true),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),
    ENCRYPTION_KEY: optionalString,

    BOT_ENABLED: bool(true),
    BOT_TOKEN: optionalString,
    BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
    BOT_WEBHOOK_SECRET: optionalString,
    ADMIN_TELEGRAM_IDS: telegramIdList,
    ORDER_NOTIFY_CHAT_ID: z.preprocess(emptyToUndefined, z.string().regex(/^-?\d+$/).optional()),

    // Reverse geocoding: turns a shared location into a street/district name.
    GEOCODER_PROVIDER: z.enum(['nominatim', 'yandex', 'none']).default('nominatim'),
    NOMINATIM_URL: z.string().url().default('https://nominatim.openstreetmap.org'),
    GEOCODER_EMAIL: optionalString,
    YANDEX_GEOCODER_API_KEY: optionalString,

    STORAGE_DRIVER: z.enum(['local']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./uploads'),

    AMOCRM_DOMAIN: optionalString,
    AMOCRM_CLIENT_ID: optionalString,
    AMOCRM_CLIENT_SECRET: optionalString,
    AMOCRM_REDIRECT_URI: z.preprocess(emptyToUndefined, z.string().url().optional()),
    AMOCRM_OAUTH_URL: z.string().url().default('https://www.amocrm.ru/oauth'),
    AMOCRM_LONG_LIVED_TOKEN: optionalString,
    AMOCRM_SYNC_ENABLED: bool(true),
    AMOCRM_SYNC_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(10),
    AMOCRM_PIPELINE_ID: optionalInt,
    AMOCRM_STATUS_ID: optionalInt,
    AMOCRM_RESPONSIBLE_USER_ID: optionalInt,
    AMOCRM_LEAD_TAGS: optionalString,
    AMOCRM_LEAD_FIELD_ORDER_NUMBER: optionalInt,
    AMOCRM_LEAD_FIELD_CUSTOMER_NAME: optionalInt,
    AMOCRM_LEAD_FIELD_PHONE: optionalInt,
    AMOCRM_LEAD_FIELD_ADDRESS: optionalInt,
    AMOCRM_LEAD_FIELD_MAP_LINK: optionalInt,
    AMOCRM_LEAD_FIELD_PRODUCTS: optionalInt,
    AMOCRM_LEAD_FIELD_QUANTITY: optionalInt,
    AMOCRM_LEAD_FIELD_EMPTY_BOTTLES: optionalInt,
    AMOCRM_LEAD_FIELD_TOTAL: optionalInt,
    AMOCRM_LEAD_FIELD_TELEGRAM_ID: optionalInt,
    AMOCRM_CONTACT_FIELD_TELEGRAM: optionalInt,
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (env.BOT_ENABLED && !env.BOT_TOKEN) {
      issue('BOT_TOKEN', 'BOT_TOKEN is required when BOT_ENABLED=true');
    }
    if (env.BOT_TOKEN && !/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(env.BOT_TOKEN)) {
      issue('BOT_TOKEN', 'BOT_TOKEN has an invalid format');
    }
    if (env.BOT_ENABLED && env.BOT_MODE === 'webhook') {
      if (!env.API_URL?.startsWith('https://')) issue('API_URL', 'Webhook mode needs an https API_URL');
      if (!env.BOT_WEBHOOK_SECRET || !/^[A-Za-z0-9_-]{16,256}$/.test(env.BOT_WEBHOOK_SECRET)) {
        issue('BOT_WEBHOOK_SECRET', 'Webhook mode needs BOT_WEBHOOK_SECRET: 16-256 chars of A-Z a-z 0-9 _ -');
      }
    }

    if (env.GEOCODER_PROVIDER === 'yandex' && !env.YANDEX_GEOCODER_API_KEY) {
      issue('YANDEX_GEOCODER_API_KEY', 'GEOCODER_PROVIDER=yandex needs YANDEX_GEOCODER_API_KEY');
    }

    const oauthParts = [env.AMOCRM_CLIENT_ID, env.AMOCRM_CLIENT_SECRET, env.AMOCRM_REDIRECT_URI];
    const oauthStarted = oauthParts.some(Boolean);
    if (oauthStarted && !oauthParts.every(Boolean)) {
      issue('AMOCRM_CLIENT_ID', 'AMOCRM_CLIENT_ID, AMOCRM_CLIENT_SECRET and AMOCRM_REDIRECT_URI must be set together');
    }
    if ((oauthStarted || env.AMOCRM_LONG_LIVED_TOKEN) && !env.AMOCRM_DOMAIN) {
      issue('AMOCRM_DOMAIN', 'AMOCRM_DOMAIN is required when amoCRM credentials are set');
    }
    if (env.AMOCRM_DOMAIN && !/^[a-z0-9-]+\.(amocrm\.ru|amocrm\.com|kommo\.com)$/i.test(env.AMOCRM_DOMAIN)) {
      issue('AMOCRM_DOMAIN', 'AMOCRM_DOMAIN must look like "company.amocrm.ru" (no protocol, no path)');
    }
    if (oauthStarted && !env.AMOCRM_LONG_LIVED_TOKEN) {
      if (!env.ENCRYPTION_KEY || Buffer.from(env.ENCRYPTION_KEY, 'base64').length !== 32) {
        issue('ENCRYPTION_KEY', 'amoCRM OAuth stores tokens encrypted: ENCRYPTION_KEY must be 32 bytes, base64-encoded');
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validates process env once at startup. A misconfigured deployment must fail loudly
 * instead of starting half-working; the error lists variable names only, never values.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

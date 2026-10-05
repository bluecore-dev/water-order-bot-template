import { Env, validateEnv } from './validation';

export interface AmocrmLeadFieldIds {
  orderNumber?: number;
  customerName?: number;
  phone?: number;
  address?: number;
  mapLink?: number;
  products?: number;
  quantity?: number;
  emptyBottles?: number;
  total?: number;
  telegramId?: number;
}

export type AmocrmAuthMode = 'long_lived' | 'oauth' | 'none';

export interface AppConfig {
  env: Env['NODE_ENV'];
  isProduction: boolean;
  port: number;
  host: string;
  logLevel: Env['LOG_LEVEL'];
  timezone: string;
  apiUrl?: string;
  swaggerEnabled: boolean;
  appSecret: string;
  encryptionKey?: Buffer;
  bot: {
    enabled: boolean;
    token?: string;
    mode: 'polling' | 'webhook';
    webhookSecret?: string;
    webhookPath: string;
    superAdminIds: string[];
    orderNotifyChatId?: string;
  };
  storage: {
    driver: 'local';
    localDir: string;
  };
  amocrm: {
    authMode: AmocrmAuthMode;
    domain?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    oauthUrl: string;
    longLivedToken?: string;
    syncEnabled: boolean;
    maxAttempts: number;
    pipelineId?: number;
    statusId?: number;
    responsibleUserId?: number;
    leadTags: string[];
    leadFields: AmocrmLeadFieldIds;
    contactFields: { telegram?: number };
  };
}

export const WEBHOOK_PATH = '/api/telegram/webhook';

export function buildConfig(env: Env): AppConfig {
  const authMode: AmocrmAuthMode = env.AMOCRM_LONG_LIVED_TOKEN
    ? 'long_lived'
    : env.AMOCRM_CLIENT_ID
      ? 'oauth'
      : 'none';

  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.PORT,
    host: env.HOST,
    logLevel: env.LOG_LEVEL,
    timezone: env.APP_TIMEZONE,
    apiUrl: env.API_URL?.replace(/\/+$/, ''),
    swaggerEnabled: env.SWAGGER_ENABLED,
    appSecret: env.APP_SECRET,
    encryptionKey: env.ENCRYPTION_KEY ? Buffer.from(env.ENCRYPTION_KEY, 'base64') : undefined,
    bot: {
      enabled: env.BOT_ENABLED,
      token: env.BOT_TOKEN,
      mode: env.BOT_MODE,
      webhookSecret: env.BOT_WEBHOOK_SECRET,
      webhookPath: WEBHOOK_PATH,
      superAdminIds: env.ADMIN_TELEGRAM_IDS,
      orderNotifyChatId: env.ORDER_NOTIFY_CHAT_ID,
    },
    storage: {
      driver: env.STORAGE_DRIVER,
      localDir: env.STORAGE_LOCAL_DIR,
    },
    amocrm: {
      authMode,
      domain: env.AMOCRM_DOMAIN?.toLowerCase(),
      clientId: env.AMOCRM_CLIENT_ID,
      clientSecret: env.AMOCRM_CLIENT_SECRET,
      redirectUri: env.AMOCRM_REDIRECT_URI,
      oauthUrl: env.AMOCRM_OAUTH_URL,
      longLivedToken: env.AMOCRM_LONG_LIVED_TOKEN,
      syncEnabled: env.AMOCRM_SYNC_ENABLED,
      maxAttempts: env.AMOCRM_SYNC_MAX_ATTEMPTS,
      pipelineId: env.AMOCRM_PIPELINE_ID,
      statusId: env.AMOCRM_STATUS_ID,
      responsibleUserId: env.AMOCRM_RESPONSIBLE_USER_ID,
      leadTags: (env.AMOCRM_LEAD_TAGS ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      leadFields: {
        orderNumber: env.AMOCRM_LEAD_FIELD_ORDER_NUMBER,
        customerName: env.AMOCRM_LEAD_FIELD_CUSTOMER_NAME,
        phone: env.AMOCRM_LEAD_FIELD_PHONE,
        address: env.AMOCRM_LEAD_FIELD_ADDRESS,
        mapLink: env.AMOCRM_LEAD_FIELD_MAP_LINK,
        products: env.AMOCRM_LEAD_FIELD_PRODUCTS,
        quantity: env.AMOCRM_LEAD_FIELD_QUANTITY,
        emptyBottles: env.AMOCRM_LEAD_FIELD_EMPTY_BOTTLES,
        total: env.AMOCRM_LEAD_FIELD_TOTAL,
        telegramId: env.AMOCRM_LEAD_FIELD_TELEGRAM_ID,
      },
      contactFields: { telegram: env.AMOCRM_CONTACT_FIELD_TELEGRAM },
    },
  };
}

/** Factory for @nestjs/config: validates env and exposes the typed tree under the `app` key. */
export const configuration = () => ({ app: buildConfig(validateEnv(process.env)) });

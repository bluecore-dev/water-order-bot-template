import { validateEnv } from '../../src/config/validation';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  APP_SECRET: 'a'.repeat(32),
  BOT_TOKEN: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234',
};

describe('environment validation', () => {
  it('accepts a minimal polling setup and applies defaults', () => {
    const env = validateEnv(base);
    expect(env).toMatchObject({ PORT: 3020, BOT_MODE: 'polling', APP_TIMEZONE: 'Asia/Tashkent', ADMIN_TELEGRAM_IDS: [] });
  });

  it('switching bots is only an env change: any well-formed token is accepted', () => {
    expect(validateEnv({ ...base, BOT_TOKEN: '987654321:ZYXWVUTSRQPONMLKJIHGFEDCBAzyxwvu9876' }).BOT_TOKEN).toMatch(/^987654321:/);
  });

  it.each([
    [{ BOT_TOKEN: '' }, 'BOT_TOKEN'],
    [{ BOT_TOKEN: 'not-a-token' }, 'BOT_TOKEN'],
    [{ APP_SECRET: 'short' }, 'APP_SECRET'],
    [{ BOT_MODE: 'webhook', API_URL: 'http://insecure.example.com' }, 'API_URL'],
    [{ BOT_MODE: 'webhook', API_URL: 'https://api.example.com' }, 'BOT_WEBHOOK_SECRET'],
    [{ AMOCRM_CLIENT_ID: 'x' }, 'AMOCRM_CLIENT_ID'],
    [{ AMOCRM_LONG_LIVED_TOKEN: 'x' }, 'AMOCRM_DOMAIN'],
    [{ AMOCRM_DOMAIN: 'https://company.amocrm.ru/' }, 'AMOCRM_DOMAIN'],
    [{ ADMIN_TELEGRAM_IDS: '123,abc' }, 'ADMIN_TELEGRAM_IDS'],
    [
      { AMOCRM_DOMAIN: 'company.amocrm.ru', AMOCRM_CLIENT_ID: 'i', AMOCRM_CLIENT_SECRET: 's', AMOCRM_REDIRECT_URI: 'https://a.b/c' },
      'ENCRYPTION_KEY',
    ],
  ])('rejects %o (mentions %s, never the value)', (override, variable) => {
    expect(() => validateEnv({ ...base, ...override })).toThrow(variable);
    try {
      validateEnv({ ...base, ...override });
    } catch (err) {
      expect((err as Error).message).not.toContain(base.APP_SECRET);
    }
  });

  it('disabling the bot makes the token optional', () => {
    expect(validateEnv({ ...base, BOT_TOKEN: '', BOT_ENABLED: 'false' }).BOT_ENABLED).toBe(false);
  });
});

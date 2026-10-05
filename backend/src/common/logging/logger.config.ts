import { RequestMethod } from '@nestjs/common';
import { Params } from 'nestjs-pino';
import { AppConfig } from '../../config/configuration';
import { redactSecrets } from '../utils/redact';

function scrub(value: unknown): unknown {
  if (typeof value === 'string') return redactSecrets(value);
  if (value instanceof Error) {
    const copy = new Error(redactSecrets(value.message));
    copy.name = value.name;
    copy.stack = value.stack ? redactSecrets(value.stack) : undefined;
    return copy;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('err' in obj || 'error' in obj) {
      return { ...obj, err: obj.err ? scrub(obj.err) : undefined, error: obj.error ? scrub(obj.error) : undefined };
    }
  }
  return value;
}

/** Strips query strings: the OAuth callback carries a one-time `code` in its URL. */
function pathOnly(url: string | undefined): string | undefined {
  return url?.split('?')[0];
}

export function buildLoggerConfig(config: AppConfig): Params {
  return {
    // Express 5 / path-to-regexp v8 syntax for "all routes" (the default "*" triggers a warning).
    forRoutes: [{ path: '{*splat}', method: RequestMethod.ALL }],
    pinoHttp: {
      level: config.logLevel,
      transport: config.isProduction || config.env === 'test' ? undefined : { target: 'pino-pretty', options: { singleLine: true } },
      enabled: config.env !== 'test',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-telegram-bot-api-secret-token"]',
          '*.password',
          '*.token',
          '*.accessToken',
          '*.refreshToken',
          '*.access_token',
          '*.refresh_token',
          '*.client_secret',
        ],
        censor: '[REDACTED]',
      },
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: pathOnly(req.url) }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      hooks: {
        logMethod(args, method) {
          method.apply(this, args.map(scrub) as Parameters<typeof method>);
        },
      },
      // Telegram webhook calls are high-volume and carry no useful request-level info.
      autoLogging: { ignore: (req) => (req.url ?? '').startsWith(config.bot.webhookPath) || req.url === '/api/health' },
    },
  };
}

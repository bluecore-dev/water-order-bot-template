import { Injectable, Logger } from '@nestjs/common';
import { redactSecrets } from '../../common/utils/redact';
import { AmocrmAuthService } from './amocrm-auth.service';
import { AmocrmApiError } from './amocrm.errors';

type Query = Record<string, string | number | undefined>;

/** Thin HTTP layer over amoCRM API v4: auth header, timeout, one retry after token refresh. */
@Injectable()
export class AmocrmApiClient {
  private readonly logger = new Logger(AmocrmApiClient.name);

  constructor(private readonly auth: AmocrmAuthService) {}

  get<T>(path: string, query?: Query): Promise<T | null> {
    return this.request<T>('GET', path, undefined, query);
  }

  post<T>(path: string, body: unknown): Promise<T | null> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown, query?: Query, retried = false): Promise<T | null> {
    const token = await this.auth.getAccessToken();
    const url = new URL(`https://${this.auth.domain}/api/v4${path}`);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'water-order-bot/1.0',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.name : 'unknown';
      throw new AmocrmApiError(0, `Network error calling amoCRM ${method} ${path}: ${reason}`);
    }

    if (res.status === 401 && !retried) {
      await this.auth.refresh();
      return this.request<T>(method, path, body, query, true);
    }
    // amoCRM answers 204 with an empty body when a list/search has no results.
    if (res.status === 204) return null;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AmocrmApiError(res.status, `amoCRM ${method} ${path} → HTTP ${res.status}: ${summarizeError(text)}`);
    }
    return (await res.json()) as T;
  }
}

/** Compresses amoCRM problem+json (including validation-errors) into one readable line. */
function summarizeError(raw: string): string {
  try {
    const data = JSON.parse(raw) as {
      title?: string;
      detail?: string;
      'validation-errors'?: Array<{ errors?: Array<{ path?: string; detail?: string }> }>;
    };
    const validation = (data['validation-errors'] ?? [])
      .flatMap((v) => v.errors ?? [])
      .map((e) => `${e.path}: ${e.detail}`)
      .slice(0, 5);
    return redactSecrets([data.title, data.detail, ...validation].filter(Boolean).join(' | ')).slice(0, 400);
  } catch {
    return redactSecrets(raw).slice(0, 200);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { decryptSecret, encryptSecret, signToken, verifyToken } from '../../common/utils/crypto';
import { safeErrorMessage } from '../../common/utils/redact';
import { AmocrmConnectedEvent, Events } from '../../common/events';
import { AMOCRM_TOKEN_PROVIDER } from './amocrm.constants';
import { AmocrmAuthError, AmocrmNotConfiguredError } from './amocrm.errors';
import { AmocrmTokenResponse } from './amocrm.types';

const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const STATE_PURPOSE = 'amocrm_oauth';
const STATE_TTL_SECONDS = 15 * 60;

export type AmocrmConnection = 'not_configured' | 'oauth_missing' | 'ready';

/**
 * amoCRM credentials. Two supported modes:
 *  - long-lived token (private integration): AMOCRM_LONG_LIVED_TOKEN in env;
 *  - OAuth2: tokens obtained via /api/amocrm/oauth/callback, stored AES-GCM encrypted and
 *    refreshed automatically (amoCRM rotates the refresh token on every refresh).
 * Only the backend ever sees these values.
 */
@Injectable()
export class AmocrmAuthService {
  private readonly logger = new Logger(AmocrmAuthService.name);
  private refreshing: Promise<string> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly events: EventEmitter2,
  ) {}

  private get cfg() {
    return this.config.amocrm;
  }

  isConfigured(): boolean {
    return this.cfg.authMode !== 'none' && !!this.cfg.domain;
  }

  get domain(): string {
    if (!this.cfg.domain) throw new AmocrmNotConfiguredError();
    return this.cfg.domain;
  }

  async connection(): Promise<AmocrmConnection> {
    if (!this.isConfigured()) return 'not_configured';
    if (this.cfg.authMode === 'long_lived') return 'ready';
    const row = await this.prisma.integrationToken.findUnique({ where: { provider: AMOCRM_TOKEN_PROVIDER } });
    return row ? 'ready' : 'oauth_missing';
  }

  async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) throw new AmocrmNotConfiguredError();
    if (this.cfg.authMode === 'long_lived') return this.cfg.longLivedToken!;

    const row = await this.prisma.integrationToken.findUnique({ where: { provider: AMOCRM_TOKEN_PROVIDER } });
    if (!row) throw new AmocrmAuthError('amoCRM OAuth is not connected yet');
    if (row.expiresAt.getTime() - REFRESH_MARGIN_MS > Date.now()) return this.decrypt(row.accessToken);
    return this.refresh();
  }

  /**
   * Single-flight refresh: concurrent callers share one request, because amoCRM invalidates
   * the old refresh token as soon as a new pair is issued.
   */
  refresh(): Promise<string> {
    if (this.cfg.authMode === 'long_lived') {
      return Promise.reject(new AmocrmAuthError('Long-lived token was rejected by amoCRM'));
    }
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<string> {
    const row = await this.prisma.integrationToken.findUnique({ where: { provider: AMOCRM_TOKEN_PROVIDER } });
    if (!row) throw new AmocrmAuthError('amoCRM OAuth is not connected yet');
    const tokens = await this.tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: this.decrypt(row.refreshToken),
    });
    await this.saveTokens(tokens);
    this.logger.log({ msg: 'amoCRM access token refreshed' });
    return tokens.access_token;
  }

  /** URL the admin opens (from the bot) to grant access. `state` binds the callback to that admin. */
  buildAuthorizeUrl(telegramId: number): string {
    if (this.cfg.authMode !== 'oauth' || !this.cfg.clientId) throw new AmocrmNotConfiguredError();
    const state = signToken({ p: STATE_PURPOSE, tg: String(telegramId) }, this.config.values.appSecret, STATE_TTL_SECONDS);
    const url = new URL(this.cfg.oauthUrl);
    url.searchParams.set('client_id', this.cfg.clientId);
    url.searchParams.set('state', state);
    return url.toString();
  }

  verifyState(state: string): { telegramId: string } | null {
    const payload = verifyToken<{ p?: string; tg?: string }>(state, this.config.values.appSecret);
    return payload?.p === STATE_PURPOSE && payload.tg ? { telegramId: payload.tg } : null;
  }

  async exchangeCode(code: string, telegramId?: string): Promise<void> {
    const tokens = await this.tokenRequest({ grant_type: 'authorization_code', code });
    await this.saveTokens(tokens);
    this.logger.log({ msg: 'amoCRM OAuth connected', domain: this.domain });
    this.events.emit(Events.AmocrmConnected, { accountDomain: this.domain, telegramId } satisfies AmocrmConnectedEvent);
  }

  async disconnect(): Promise<void> {
    await this.prisma.integrationToken.deleteMany({ where: { provider: AMOCRM_TOKEN_PROVIDER } });
  }

  private async tokenRequest(grant: Record<string, string>): Promise<AmocrmTokenResponse> {
    // The client secret is only ever sent to the configured account domain — never to a
    // domain taken from request parameters.
    let res: Response;
    try {
      res = await fetch(`https://${this.domain}/oauth2/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: this.cfg.clientId,
          client_secret: this.cfg.clientSecret,
          redirect_uri: this.cfg.redirectUri,
          ...grant,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new AmocrmAuthError(`Token request failed: ${safeErrorMessage(err)}`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // 400/401 here means the code or refresh token is no longer valid: re-authorization needed.
      throw new AmocrmAuthError(`Token request rejected: HTTP ${res.status} ${safeErrorMessage(body, 200)}`);
    }
    const data = (await res.json()) as AmocrmTokenResponse;
    if (!data.access_token || !data.refresh_token) throw new AmocrmAuthError('Token response is incomplete');
    return data;
  }

  private async saveTokens(tokens: AmocrmTokenResponse): Promise<void> {
    const key = this.key();
    const data = {
      accessToken: encryptSecret(tokens.access_token, key),
      refreshToken: encryptSecret(tokens.refresh_token, key),
      expiresAt: new Date(Date.now() + Math.max(60, tokens.expires_in) * 1000),
      accountDomain: this.domain,
    };
    await this.prisma.integrationToken.upsert({
      where: { provider: AMOCRM_TOKEN_PROVIDER },
      create: { provider: AMOCRM_TOKEN_PROVIDER, ...data },
      update: data,
    });
  }

  private decrypt(value: string): string {
    try {
      return decryptSecret(value, this.key());
    } catch {
      throw new AmocrmAuthError('Stored amoCRM token cannot be decrypted (ENCRYPTION_KEY changed?) — reconnect amoCRM');
    }
  }

  private key(): Buffer {
    const key = this.config.values.encryptionKey;
    if (!key || key.length !== 32) throw new AmocrmAuthError('ENCRYPTION_KEY is missing or invalid');
    return key;
  }
}

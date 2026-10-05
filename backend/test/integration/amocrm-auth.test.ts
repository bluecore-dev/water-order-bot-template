import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppConfigService } from '../../src/config/app-config.service';
import { AmocrmAuthService } from '../../src/integrations/amocrm/amocrm-auth.service';
import { AmocrmAuthError } from '../../src/integrations/amocrm/amocrm.errors';
import { createTestApp, resetDb, TestApp } from '../helpers';

function oauthConfig(): AppConfigService {
  return {
    amocrm: {
      authMode: 'oauth',
      domain: 'company.amocrm.ru',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'https://api.example.com/api/amocrm/oauth/callback',
      oauthUrl: 'https://www.amocrm.ru/oauth',
    },
    values: { appSecret: 'x'.repeat(40), encryptionKey: Buffer.alloc(32, 3) },
  } as unknown as AppConfigService;
}

const tokenResponse = (n: number) =>
  new Response(JSON.stringify({ token_type: 'Bearer', expires_in: 86400, access_token: `access-${n}`, refresh_token: `refresh-${n}` }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('amoCRM OAuth tokens', () => {
  let t: TestApp;
  let auth: AmocrmAuthService;
  let fetchSpy: jest.SpyInstance;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    auth = new AmocrmAuthService(t.prisma, oauthConfig(), new EventEmitter2());
    fetchSpy = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  it('not connected yet → auth error, connection reports oauth_missing', async () => {
    expect(await auth.connection()).toBe('oauth_missing');
    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(AmocrmAuthError);
  });

  it('exchanges the code at the configured domain and stores tokens encrypted', async () => {
    fetchSpy.mockResolvedValueOnce(tokenResponse(1));
    await auth.exchangeCode('auth-code');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://company.amocrm.ru/oauth2/access_token');
    expect(JSON.parse(init.body)).toMatchObject({ grant_type: 'authorization_code', code: 'auth-code', client_secret: 'client-secret' });

    const row = await t.prisma.integrationToken.findUniqueOrThrow({ where: { provider: 'amocrm' } });
    expect(row.accessToken).not.toContain('access-1');
    expect(row.refreshToken).not.toContain('refresh-1');
    expect(await auth.getAccessToken()).toBe('access-1');
    expect(await auth.connection()).toBe('ready');
  });

  it('refreshes an expiring token once for concurrent callers and stores the rotated pair', async () => {
    fetchSpy.mockResolvedValueOnce(tokenResponse(1));
    await auth.exchangeCode('auth-code');
    await t.prisma.integrationToken.update({ where: { provider: 'amocrm' }, data: { expiresAt: new Date(Date.now() + 60_000) } });

    fetchSpy.mockResolvedValueOnce(tokenResponse(2));
    const tokens = await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.getAccessToken()]);
    expect(tokens).toEqual(['access-2', 'access-2', 'access-2']);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchSpy.mock.calls[1][1].body)).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'refresh-1' });
    expect(await auth.getAccessToken()).toBe('access-2');
  });

  it('a rejected refresh token surfaces as an auth error (re-connect needed)', async () => {
    fetchSpy.mockResolvedValueOnce(tokenResponse(1));
    await auth.exchangeCode('auth-code');
    await t.prisma.integrationToken.update({ where: { provider: 'amocrm' }, data: { expiresAt: new Date(0) } });
    fetchSpy.mockResolvedValueOnce(new Response('{"hint":"Token has been revoked"}', { status: 400 }));
    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(AmocrmAuthError);
  });

  it('builds a consent URL with a verifiable state bound to the admin', () => {
    const url = new URL(auth.buildAuthorizeUrl(900000001));
    expect(url.origin + url.pathname).toBe('https://www.amocrm.ru/oauth');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(auth.verifyState(url.searchParams.get('state')!)).toEqual({ telegramId: '900000001' });
  });
});

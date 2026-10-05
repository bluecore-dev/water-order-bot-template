import request from 'supertest';
import { AmocrmAuthService } from '../../src/integrations/amocrm/amocrm-auth.service';
import { createTestApp, TestApp } from '../helpers';

describe('HTTP surface', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('GET /api/health reports database and bot without leaking details', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up', bot: 'disabled' });
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('unknown routes return the consistent error envelope', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/products').expect(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('Telegram webhook is closed when the bot runs in polling mode', async () => {
    await request(t.app.getHttpServer()).post('/api/telegram/webhook').send({ update_id: 1 }).expect(404);
  });

  it('amoCRM OAuth callback rejects missing, forged and expired state', async () => {
    const server = t.app.getHttpServer();
    await request(server).get('/api/amocrm/oauth/callback').expect(400);
    await request(server).get('/api/amocrm/oauth/callback?code=abc&state=forged.state').expect(400);
    const res = await request(server).get('/api/amocrm/oauth/callback?error=access_denied').expect(400);
    expect(res.text).toContain('amoCRM ulanmadi');
    expect(t.get(AmocrmAuthService).verifyState('x.y')).toBeNull();
  });
});

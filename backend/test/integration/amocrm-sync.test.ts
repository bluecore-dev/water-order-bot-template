import { randomUUID } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AmocrmEntityType, SyncStatus } from '@prisma/client';
import { AppConfigService } from '../../src/config/app-config.service';
import { Events } from '../../src/common/events';
import { AmocrmSyncService } from '../../src/integrations/amocrm/amocrm-sync.service';
import { AmocrmApiError, AmocrmAuthError } from '../../src/integrations/amocrm/amocrm.errors';
import { AmocrmService } from '../../src/integrations/amocrm/amocrm.service';
import { AmocrmAuthService } from '../../src/integrations/amocrm/amocrm-auth.service';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { ProductsService } from '../../src/modules/products/products.service';
import { UsersService } from '../../src/modules/users/users.service';
import { createTestApp, resetDb, TestApp } from '../helpers';

/** In-memory stand-in for amoCRM that records calls and can be told to fail. */
class FakeAmocrm {
  contacts = new Map<number, string>(); // id → phone
  leads: Array<{ id: number; name: string; contactId: number; price?: number }> = [];
  notes: Array<{ id: number; leadId: number; text: string }> = [];
  failLead = 0;
  failContactWith: Error | null = null;
  private seq = 100;

  async findContactIdByPhone(phone: string) {
    if (this.failContactWith) throw this.failContactWith;
    const key = phone.replace(/\D/g, '').slice(-9);
    for (const [id, p] of this.contacts) if (p.replace(/\D/g, '').slice(-9) === key) return id;
    return null;
  }
  async createContact(c: { custom_fields_values?: Array<{ values: Array<{ value: unknown }> }> }) {
    const id = ++this.seq;
    this.contacts.set(id, String(c.custom_fields_values?.[0].values[0].value));
    return id;
  }
  async createLead(l: { name: string; price?: number; _embedded?: { contacts?: Array<{ id: number }> } }) {
    if (this.failLead > 0) {
      this.failLead--;
      throw new AmocrmApiError(503, 'amoCRM POST /leads → HTTP 503: Service Unavailable');
    }
    const id = ++this.seq;
    this.leads.push({ id, name: l.name, contactId: l._embedded!.contacts![0].id, price: l.price });
    return id;
  }
  async findLeadIdByExactName(name: string) {
    return this.leads.find((l) => l.name === name)?.id ?? null;
  }
  async addLeadNote(leadId: number, text: string) {
    const id = ++this.seq;
    this.notes.push({ id, leadId, text });
    return id;
  }
  async leadFieldTypes() {
    return new Map<number, string>();
  }
}

describe('amoCRM sync worker', () => {
  let t: TestApp;
  let fake: FakeAmocrm;
  let sync: AmocrmSyncService;
  let events: EventEmitter2;
  let productId: number;
  let userId: number;

  beforeAll(async () => {
    t = await createTestApp();
    events = t.get(EventEmitter2);
    // The app-level sync service is not configured (no AMOCRM_* in test env), so its auto-kick
    // is a no-op. Here a separately wired instance talks to the fake amoCRM.
    const auth = { isConfigured: () => true } as unknown as AmocrmAuthService;
    fake = new FakeAmocrm();
    sync = new AmocrmSyncService(t.prisma, t.get(AppConfigService), auth, fake as unknown as AmocrmService, events);
    sync.autoKick = false;
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    fake.contacts.clear();
    fake.leads = [];
    fake.notes = [];
    fake.failLead = 0;
    fake.failContactWith = null;
    productId = (await t.get(ProductsService).create({ name: '18.9 L suv', price: 15000 })).id;
    userId = (await t.get(UsersService).upsertFromTelegram({ id: 555001, first_name: 'Ali', username: 'ali' })).id;
  });

  const placeOrder = async (phone = '+998901234567') =>
    (
      await t.get(OrdersService).createOrder({
        userId,
        items: [{ productId, quantity: 3 }],
        emptyBottleCount: 2,
        phone,
        customerName: 'Ali',
        address: { text: 'Chilonzor 9', latitude: 41.28, longitude: 69.2 },
        idempotencyKey: randomUUID(),
      })
    ).order;

  const rows = (orderId: number) => t.prisma.amocrmSync.findMany({ where: { orderId }, orderBy: { id: 'asc' } });
  const makeDue = (orderId: number) =>
    t.prisma.amocrmSync.updateMany({ where: { orderId, status: { not: SyncStatus.SUCCESS } }, data: { nextAttemptAt: new Date() } });

  it('success: creates contact, lead and note and stores the amoCRM ids', async () => {
    const order = await placeOrder();
    expect(await sync.processOrder(order.id)).toBe('done');

    const saved = await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.amocrmContactId).toBe([...fake.contacts.keys()][0]);
    expect(saved.amocrmLeadId).toBe(fake.leads[0].id);
    expect(fake.leads[0]).toMatchObject({ name: 'Buyurtma #1001', price: 45000, contactId: saved.amocrmContactId });
    expect(fake.notes[0].text).toContain('Bo‘sh idishlar: 2 ta');
    expect((await rows(order.id)).map((r) => r.status)).toEqual([SyncStatus.SUCCESS, SyncStatus.SUCCESS, SyncStatus.SUCCESS]);
  });

  it('reuses an existing amoCRM contact with the same phone (no duplicate customers)', async () => {
    fake.contacts.set(7, '998 90 123 45 67');
    const first = await placeOrder('+998901234567');
    const second = await placeOrder('90 123 45 67');
    await sync.processOrder(first.id);
    await sync.processOrder(second.id);
    expect(fake.contacts.size).toBe(1);
    expect(fake.leads.map((l) => l.contactId)).toEqual([7, 7]);
  });

  it('failure keeps the order, schedules a retry and never repeats finished steps', async () => {
    const failed: unknown[] = [];
    events.on(Events.AmocrmSyncFailed, (e) => failed.push(e));
    fake.failLead = 1;
    const order = await placeOrder();

    expect(await sync.processOrder(order.id)).toBe('failed');
    const [contact, lead, note] = await rows(order.id);
    expect(contact.status).toBe(SyncStatus.SUCCESS);
    expect(lead).toMatchObject({ status: SyncStatus.FAILED, attempts: 1 });
    expect(lead.errorMessage).toContain('503');
    expect(lead.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    expect(note.status).toBe(SyncStatus.PENDING);
    expect(await t.prisma.order.count()).toBe(1); // the local order is untouched

    // Not due yet: a second run does nothing.
    expect(await sync.processOrder(order.id)).toBe('skipped');

    await makeDue(order.id);
    expect(await sync.processOrder(order.id)).toBe('done');
    expect(fake.contacts.size).toBe(1);
    expect(fake.leads).toHaveLength(1);
    expect(fake.notes).toHaveLength(1);
    expect(failed).toHaveLength(0); // admins are alerted from the 3rd attempt
  });

  it('gives up after the configured attempts and alerts admins', async () => {
    const failed: Array<{ final: boolean; attempts: number }> = [];
    events.on(Events.AmocrmSyncFailed, (e) => failed.push(e));
    const max = t.get(AppConfigService).amocrm.maxAttempts;
    fake.failLead = max + 5;
    const order = await placeOrder();

    for (let i = 0; i < max; i++) {
      await makeDue(order.id);
      await sync.processOrder(order.id);
    }
    const lead = (await rows(order.id)).find((r) => r.entityType === AmocrmEntityType.LEAD)!;
    expect(lead).toMatchObject({ status: SyncStatus.FAILED, attempts: max, nextAttemptAt: null });
    expect(failed.map((f) => f.final)).toEqual([false, true]);

    // Manual resend from the admin panel starts a fresh round.
    fake.failLead = 0;
    await sync.requeueOrder(order.id);
    expect(await sync.processOrder(order.id)).toBe('done');
    expect((await rows(order.id)).every((r) => r.status === SyncStatus.SUCCESS)).toBe(true);
  });

  it('credential problems park orders without burning attempts', async () => {
    const authAlerts: unknown[] = [];
    events.on(Events.AmocrmAuthFailed, (e) => authAlerts.push(e));
    fake.failContactWith = new AmocrmAuthError('amoCRM OAuth is not connected yet');
    const order = await placeOrder();

    expect(await sync.processOrder(order.id)).toBe('waiting_auth');
    const [contact] = await rows(order.id);
    expect(contact).toMatchObject({ status: SyncStatus.PENDING, attempts: 0 });
    expect(contact.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    expect(authAlerts).toHaveLength(1);
  });

  it('a retry after a crash finds the lead created by the lost attempt instead of duplicating it', async () => {
    const order = await placeOrder();
    await sync.processOrder(order.id);
    // Simulate: lead was created in amoCRM, but the DB never recorded it.
    await t.prisma.order.update({ where: { id: order.id }, data: { amocrmLeadId: null } });
    await t.prisma.amocrmSync.updateMany({
      where: { orderId: order.id, entityType: { in: [AmocrmEntityType.LEAD, AmocrmEntityType.NOTE] } },
      data: { status: SyncStatus.FAILED, attempts: 1, nextAttemptAt: new Date() },
    });
    await sync.processOrder(order.id);
    expect(fake.leads).toHaveLength(1);
  });

  it('recovers rows stuck in PROCESSING after a restart', async () => {
    const order = await placeOrder();
    await t.prisma.amocrmSync.updateMany({
      where: { orderId: order.id, entityType: AmocrmEntityType.CONTACT },
      data: { status: SyncStatus.PROCESSING, lastAttemptAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    expect(await sync.recoverStale()).toBe(1);
    expect(await sync.processOrder(order.id)).toBe('done');
  });
});

import { OrderStatus, SyncStatus, AmocrmEntityType } from '@prisma/client';
import { getMessages } from '../../src/i18n';
import { buildContactPayload, buildLeadPayload, buildNoteText } from '../../src/integrations/amocrm/amocrm-payload.builder';
import type { OrderFull } from '../../src/modules/orders/orders.service';

const t = getMessages('uz');

function order(overrides: Partial<OrderFull> = {}): OrderFull {
  const now = new Date('2026-10-05T09:30:00Z');
  return {
    id: 7,
    orderNumber: 1042,
    userId: 1,
    customerName: 'Ali Valiyev',
    phone: '+998901234567',
    deliveryAddress: 'Chilonzor 9-kvartal, 12-uy',
    latitude: 41.2856,
    longitude: 69.2034,
    emptyBottleCount: 2,
    totalAmount: 45000,
    status: OrderStatus.NEW,
    amocrmLeadId: null,
    amocrmContactId: null,
    idempotencyKey: 'k',
    createdAt: now,
    updatedAt: now,
    items: [{ id: 1, orderId: 7, productId: 1, productNameSnapshot: '18.9 L suv', unitPrice: 15000, quantity: 3, subtotal: 45000 }],
    user: {
      id: 1,
      telegramId: BigInt(555001),
      telegramUsername: 'ali',
      firstName: 'Ali',
      lastName: null,
      phone: '+998901234567',
      language: 'uz',
      createdAt: now,
      updatedAt: now,
    },
    amocrmSyncs: [
      {
        id: 1,
        orderId: 7,
        entityType: AmocrmEntityType.CONTACT,
        entityId: null,
        status: SyncStatus.PENDING,
        attempts: 0,
        nextAttemptAt: now,
        lastAttemptAt: null,
        errorMessage: null,
        syncedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    ...overrides,
  } as OrderFull;
}

describe('amoCRM payloads', () => {
  it('contact carries the phone in the standard PHONE field', () => {
    const payload = buildContactPayload(order(), t);
    expect(payload.name).toBe('Ali Valiyev');
    expect(payload.custom_fields_values).toEqual([{ field_code: 'PHONE', values: [{ value: '+998901234567', enum_code: 'MOB' }] }]);
  });

  it('lead without configured fields has no custom fields and links the contact', () => {
    const lead = buildLeadPayload(order(), 321, { tags: [], fields: {}, fieldTypes: new Map() }, t);
    expect(lead).toEqual({ name: 'Buyurtma #1042', price: 45000, _embedded: { contacts: [{ id: 321 }] } });
  });

  it('lead uses only configured field ids and sends numbers to numeric fields', () => {
    const lead = buildLeadPayload(
      order(),
      321,
      {
        pipelineId: 10,
        statusId: 20,
        responsibleUserId: 30,
        tags: ['telegram-bot'],
        fields: { address: 101, emptyBottles: 102, orderNumber: 103, products: 104 },
        fieldTypes: new Map([
          [101, 'textarea'],
          [102, 'numeric'],
          [103, 'text'],
          [104, 'textarea'],
        ]),
      },
      t,
    );
    expect(lead.pipeline_id).toBe(10);
    expect(lead.status_id).toBe(20);
    expect(lead.responsible_user_id).toBe(30);
    expect(lead._embedded?.tags).toEqual([{ name: 'telegram-bot' }]);
    expect(lead.custom_fields_values).toEqual([
      { field_id: 103, values: [{ value: '1042' }] },
      { field_id: 101, values: [{ value: 'Chilonzor 9-kvartal, 12-uy' }] },
      { field_id: 104, values: [{ value: '18.9 L suv × 3' }] },
      { field_id: 102, values: [{ value: 2 }] },
    ]);
  });

  it('note contains the price snapshot, bottles, address and map link', () => {
    const note = buildNoteText(order(), t, 'Asia/Tashkent');
    expect(note).toContain('#1042');
    expect(note).toContain('18.9 L suv × 3 (15 000 so‘m) = 45 000 so‘m');
    expect(note).toContain('Bo‘sh idishlar: 2 ta');
    expect(note).toContain('Chilonzor 9-kvartal, 12-uy');
    expect(note).toContain('yandex.uz/maps/?pt=69.2034,41.2856');
    expect(note).toContain('05.10.2026 14:30');
  });
});

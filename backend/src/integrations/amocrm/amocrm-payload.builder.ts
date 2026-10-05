import { AmocrmLeadFieldIds } from '../../config/configuration';
import { formatPhone } from '../../common/utils/phone';
import { yandexMapLink } from '../../common/utils/format';
import { formatDateTime } from '../../common/utils/time';
import type { Messages } from '../../i18n';
import type { OrderFull } from '../../modules/orders/orders.service';
import { UsersService } from '../../modules/users/users.service';
import { AmocrmContactCreate, AmocrmCustomFieldValue, AmocrmLeadCreate } from './amocrm.types';

export interface LeadOptions {
  pipelineId?: number;
  statusId?: number;
  responsibleUserId?: number;
  tags: string[];
  fields: AmocrmLeadFieldIds;
  /** Field id → amoCRM field type, to send numbers to numeric fields. */
  fieldTypes: Map<number, string>;
}

const NUMERIC_TYPES = new Set(['numeric', 'price']);

function customerName(order: OrderFull, t: Messages): string {
  return order.customerName || UsersService.displayName(order.user) || t.crm.defaultContactName;
}

function mapLink(order: OrderFull): string | null {
  return order.latitude != null && order.longitude != null ? yandexMapLink(order.latitude, order.longitude) : null;
}

export function buildContactPayload(order: OrderFull, t: Messages, telegramFieldId?: number): AmocrmContactCreate {
  const fields: AmocrmCustomFieldValue[] = [{ field_code: 'PHONE', values: [{ value: order.phone, enum_code: 'MOB' }] }];
  if (telegramFieldId) {
    const tg = order.user.telegramUsername ? `@${order.user.telegramUsername}` : order.user.telegramId.toString();
    fields.push({ field_id: telegramFieldId, values: [{ value: tg }] });
  }
  return { name: customerName(order, t), custom_fields_values: fields };
}

/**
 * Lead with order data. Custom fields are added only for ids configured in env, so the same
 * code works with any amoCRM account layout (no hardcoded field ids).
 */
export function buildLeadPayload(order: OrderFull, contactId: number, opts: LeadOptions, t: Messages): AmocrmLeadCreate {
  const productsText = order.items.map((i) => `${i.productNameSnapshot} × ${i.quantity}`).join('; ');
  const quantity = order.items.reduce((s, i) => s + i.quantity, 0);
  const values: Array<[number | undefined, string | number | null]> = [
    [opts.fields.orderNumber, order.orderNumber],
    [opts.fields.customerName, customerName(order, t)],
    [opts.fields.phone, order.phone],
    [opts.fields.address, order.deliveryAddress],
    [opts.fields.mapLink, mapLink(order)],
    [opts.fields.products, productsText],
    [opts.fields.quantity, quantity],
    [opts.fields.emptyBottles, order.emptyBottleCount],
    [opts.fields.total, order.totalAmount],
    [opts.fields.telegramId, order.user.telegramId.toString()],
  ];

  const custom: AmocrmCustomFieldValue[] = [];
  for (const [fieldId, raw] of values) {
    if (!fieldId || raw === null || raw === '') continue;
    const numeric = NUMERIC_TYPES.has(opts.fieldTypes.get(fieldId) ?? '');
    const value = numeric && Number.isFinite(Number(raw)) ? Number(raw) : String(raw);
    custom.push({ field_id: fieldId, values: [{ value }] });
  }

  const lead: AmocrmLeadCreate = {
    name: t.crm.leadName(order.orderNumber),
    price: order.totalAmount,
    _embedded: { contacts: [{ id: contactId }] },
  };
  if (opts.pipelineId) lead.pipeline_id = opts.pipelineId;
  if (opts.statusId) lead.status_id = opts.statusId;
  if (opts.responsibleUserId) lead.responsible_user_id = opts.responsibleUserId;
  if (custom.length) lead.custom_fields_values = custom;
  if (opts.tags.length) lead._embedded!.tags = opts.tags.map((name) => ({ name }));
  return lead;
}

/** Full order as a note: always present, so operators see everything even without custom fields. */
export function buildNoteText(order: OrderFull, t: Messages, timeZone: string): string {
  const link = mapLink(order);
  return [
    `${t.crm.noteTitle(order.orderNumber)} · ${formatDateTime(order.createdAt, timeZone)}`,
    '',
    ...order.items.map((i) => t.crm.noteLine(i.productNameSnapshot, i.quantity, i.unitPrice, i.subtotal)),
    t.crm.noteBottles(order.emptyBottleCount),
    t.crm.noteTotal(order.totalAmount),
    '',
    t.crm.noteCustomer(customerName(order, t)),
    t.crm.notePhone(formatPhone(order.phone)),
    t.crm.noteAddress(order.deliveryAddress),
    ...(link ? [t.crm.noteMap(link)] : []),
    t.crm.noteTelegram(order.user.telegramId.toString(), order.user.telegramUsername),
  ].join('\n');
}

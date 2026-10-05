import { SettingKey } from '../modules/settings/settings.registry';
import { AdminProductField } from './context';

/**
 * Callback data builders. Telegram limits callback_data to 64 bytes, so prefixes are short.
 * Product quantity lives in the data itself (stateless), so cards keep working after restarts.
 */
export const CB = {
  noop: 'noop',
  catalog: 'cat',
  /** "Order" button under reminders/broadcasts: always opens the catalog in a NEW message. */
  startOrder: 'go',
  product: (id: number) => `prd:${id}`,
  qty: (id: number, qty: number) => `qty:${id}:${qty}`,
  add: (id: number, qty: number) => `add:${id}:${qty}`,
  cart: 'cart',
  cartClear: 'cart:clr',

  checkout: 'co:go',
  bottles: (n: number) => `bt:${n}`,
  bottlesMore: 'bt:more',
  confirm: 'co:ok',
  edit: 'co:edit',
  editField: (field: 'items' | 'bottles' | 'phone' | 'address') => `co:ed:${field}`,
  summary: 'co:sum',
  cancelCheckout: 'co:cancel',

  orders: (page: number) => `ord:p:${page}`,
  order: (id: number, page: number) => `ord:v:${id}:${page}`,
  repeat: (id: number) => `ord:r:${id}`,

  profilePhone: 'prof:phone',

  addresses: 'addr:list',
  addressDefault: (id: number) => `addr:def:${id}`,
  addressRemove: (id: number) => `addr:del:${id}`,
  addressNew: 'addr:new',

  admin: {
    menu: 'adm:menu',
    products: 'adm:prd:list',
    product: (id: number) => `adm:prd:v:${id}`,
    productEdit: (id: number, field: AdminProductField) => `adm:prd:e:${id}:${field}`,
    productToggle: (id: number) => `adm:prd:tg:${id}`,
    productDelete: (id: number) => `adm:prd:del:${id}`,
    productDeleteConfirm: (id: number) => `adm:prd:delok:${id}`,
    productNew: 'adm:prd:new',
    stats: 'adm:stats',
    orders: (page: number) => `adm:ord:p:${page}`,
    order: (id: number, page: number) => `adm:ord:v:${id}:${page}`,
    orderResync: (id: number, page: number) => `adm:ord:rs:${id}:${page}`,
    settings: 'adm:set:list',
    setting: (key: SettingKey) => `adm:set:e:${key}`,
    botPhoto: 'adm:set:photo',
    amocrm: 'adm:amo',
    amocrmCheck: 'adm:amo:check',
    amocrmRetry: 'adm:amo:retry',
    admins: 'adm:adm:list',
    adminAdd: 'adm:adm:add',
    adminRemove: (telegramId: string) => `adm:adm:del:${telegramId}`,
    broadcast: 'adm:bc:new',
    broadcastSend: 'adm:bc:send',
    broadcastCancel: 'adm:bc:cancel',
  },
} as const;

/** Request id for the "pick a user" keyboard button in admin management. */
export const ADMIN_PICK_REQUEST_ID = 1;

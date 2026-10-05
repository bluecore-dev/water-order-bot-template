import { Context, SessionFlavor } from 'grammy';
import { AdminRole, User } from '@prisma/client';
import { Messages } from '../i18n';
import { SettingKey } from '../modules/settings/settings.registry';

/** Every conversational step the bot can wait in. Unknown values are reset to `idle`. */
export const BOT_STATES = [
  'idle',
  'checkout:bottles_custom',
  'checkout:phone',
  'checkout:address',
  'checkout:address_details',
  'profile:phone',
  'addresses:new',
  'addresses:new_details',
  'admin:product:create:name',
  'admin:product:create:price',
  'admin:product:create:description',
  'admin:product:create:photo',
  'admin:product:edit',
  'admin:setting:edit',
  'admin:admins:add',
  'admin:broadcast:compose',
  'admin:bot:photo',
] as const;

export type BotState = (typeof BOT_STATES)[number];

export interface CartItem {
  productId: number;
  quantity: number;
}

export interface DraftAddress {
  text: string;
  latitude?: number;
  longitude?: number;
}

export interface CheckoutDraft {
  emptyBottles?: number;
  phone?: string;
  address?: DraftAddress;
  /** Identifies this checkout; becomes Order.idempotencyKey. */
  idempotencyKey?: string;
  /** ms epoch; an abandoned checkout expires (old "Confirm" buttons stop working). */
  startedAt?: number;
  /** Total shown on the last summary; createOrder rejects if prices moved since. */
  shownTotal?: number;
}

export type AdminProductField = 'name' | 'price' | 'description' | 'photo' | 'sortOrder';

export interface AdminDraft {
  productId?: number;
  field?: AdminProductField;
  settingKey?: SettingKey;
  newProduct?: { name?: string; price?: number; description?: string | null };
  /** Message the admin composed for a broadcast (copied to every customer). */
  broadcast?: { chatId: number; messageId: number };
}

export interface SessionData {
  state: BotState;
  cart: CartItem[];
  checkout: CheckoutDraft;
  /** Location received before the optional "house/apartment" clarification. */
  pendingLocation?: { latitude: number; longitude: number; label?: string };
  /** Reply-keyboard label → saved address id, for the address step. */
  addressChoices?: Record<string, number>;
  admin?: AdminDraft;
}

export function createInitialSession(): SessionData {
  return { state: 'idle', cart: [], checkout: {} };
}

/** Repairs sessions saved by older code versions or tampered storage. */
export function sanitizeSession(raw: unknown): SessionData {
  const base = createInitialSession();
  if (!raw || typeof raw !== 'object') return base;
  const s = raw as Partial<SessionData>;
  return {
    state: BOT_STATES.includes(s.state as BotState) ? (s.state as BotState) : 'idle',
    cart: Array.isArray(s.cart)
      ? s.cart.filter((i) => Number.isInteger(i?.productId) && Number.isInteger(i?.quantity) && i.quantity > 0)
      : [],
    checkout: s.checkout && typeof s.checkout === 'object' ? s.checkout : {},
    pendingLocation: s.pendingLocation,
    addressChoices: s.addressChoices,
    admin: s.admin,
  };
}

export interface BotContextExtras {
  /** DB user for the sender (set by userContext middleware for every private update). */
  user: User;
  t: Messages;
  adminRole: AdminRole | null;
}

export type BotContext = Context & SessionFlavor<SessionData> & BotContextExtras;

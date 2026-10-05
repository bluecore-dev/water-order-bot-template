import { parseAmountInput } from '../../common/utils/format';
import { normalizePhone } from '../../common/utils/phone';

/**
 * Business settings editable by admins from the bot. Client-specific data (name, phone,
 * hours…) lives here, never in code. Secrets and integration IDs belong in env, not here.
 */
export type SettingKey =
  | 'company_name'
  | 'support_phone'
  | 'support_telegram'
  | 'working_hours'
  | 'payment_note'
  | 'max_item_quantity'
  | 'min_order_quantity'
  | 'max_empty_bottles'
  | 'damaged_bottle_fine'
  | 'reminder_first_minutes'
  | 'reminder_second_minutes'
  | 'reminder_text'
  | 'reminder_text_2'
  | 'bot_about'
  | 'bot_description';

export interface SettingDefinition {
  key: SettingKey;
  kind: 'text' | 'int';
  defaultValue: string;
  /** Empty value allowed (admin can clear it with "-"). */
  optional: boolean;
  /** Returns the normalized value, or null when the input is invalid. */
  normalize: (input: string) => string | null;
}

const text = (max: number) => (input: string) => {
  const v = input.trim();
  return v.length > 0 && v.length <= max ? v : null;
};

const int = (min: number, max: number) => (input: string) => {
  const v = input.replace(/\s/g, '');
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? String(n) : null;
};

export const SETTING_DEFINITIONS: Record<SettingKey, SettingDefinition> = {
  company_name: { key: 'company_name', kind: 'text', defaultValue: '', optional: true, normalize: text(64) },
  support_phone: {
    key: 'support_phone',
    kind: 'text',
    defaultValue: '',
    optional: true,
    normalize: (input) => normalizePhone(input),
  },
  support_telegram: {
    key: 'support_telegram',
    kind: 'text',
    defaultValue: '',
    optional: true,
    normalize: (input) => {
      const v = input.trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
      return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(v) ? `@${v}` : null;
    },
  },
  working_hours: { key: 'working_hours', kind: 'text', defaultValue: '', optional: true, normalize: text(120) },
  payment_note: { key: 'payment_note', kind: 'text', defaultValue: '', optional: true, normalize: text(300) },
  max_item_quantity: { key: 'max_item_quantity', kind: 'int', defaultValue: '50', optional: false, normalize: int(1, 1000) },
  /** Minimum total number of items in one order (e.g. "at least 2 bottles"). */
  min_order_quantity: { key: 'min_order_quantity', kind: 'int', defaultValue: '1', optional: false, normalize: int(1, 1000) },
  max_empty_bottles: { key: 'max_empty_bottles', kind: 'int', defaultValue: '100', optional: false, normalize: int(1, 10000) },
  /**
   * Fine for a damaged returned bottle, collected by the courier on the spot. Informational
   * only (never added to the order total); 0 hides the notice.
   */
  damaged_bottle_fine: {
    key: 'damaged_bottle_fine',
    kind: 'int',
    defaultValue: '0',
    optional: false,
    normalize: (input) => {
      const v = parseAmountInput(input);
      return v !== null && v <= 100_000_000 ? String(v) : null;
    },
  },
  /** Minutes after /start (with no reply) before the first reminder; 0 = no first reminder. */
  reminder_first_minutes: { key: 'reminder_first_minutes', kind: 'int', defaultValue: '10', optional: false, normalize: int(0, 1440) },
  /** Minutes after /start before the second (last) reminder; 0 = no second reminder. */
  reminder_second_minutes: { key: 'reminder_second_minutes', kind: 'int', defaultValue: '60', optional: false, normalize: int(0, 10080) },
  /** Custom text of the first reminder; empty = the default text from the locale. */
  reminder_text: { key: 'reminder_text', kind: 'text', defaultValue: '', optional: true, normalize: text(500) },
  /** Custom text of the second reminder; empty = the default text from the locale. */
  reminder_text_2: { key: 'reminder_text_2', kind: 'text', defaultValue: '', optional: true, normalize: text(500) },
  /** Custom Telegram "About" (short description); empty = generated from the company name. */
  bot_about: { key: 'bot_about', kind: 'text', defaultValue: '', optional: true, normalize: text(120) },
  /** Custom "What can this bot do?" text shown before Start; empty = generated from settings. */
  bot_description: { key: 'bot_description', kind: 'text', defaultValue: '', optional: true, normalize: text(512) },
};

export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[];

export const isSettingKey = (key: string): key is SettingKey => key in SETTING_DEFINITIONS;

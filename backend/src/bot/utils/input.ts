import { normalizePhone } from '../../common/utils/phone';
import { BotContext } from '../context';
import { labelsFor } from '../keyboards';

export type PhoneInput = { phone: string } | { error: 'foreign_contact' | 'invalid' };

/**
 * Accepts the user's own shared contact or a typed number. A contact card of somebody else is
 * rejected: the phone must reach the person who ordered.
 */
export function readPhoneInput(ctx: BotContext): PhoneInput {
  const contact = ctx.message?.contact;
  if (contact) {
    if (contact.user_id !== ctx.from?.id) return { error: 'foreign_contact' };
    const phone = normalizePhone(contact.phone_number);
    return phone ? { phone } : { error: 'invalid' };
  }
  const phone = normalizePhone(ctx.message?.text);
  return phone ? { phone } : { error: 'invalid' };
}

const SKIP_LABELS = new Set(labelsFor((t) => t.common.skip));

export function isSkip(text: string | undefined): boolean {
  return !!text && SKIP_LABELS.has(text.trim());
}

/** "-" clears an optional value in admin forms. */
export function isClear(text: string | undefined): boolean {
  return text?.trim() === '-';
}

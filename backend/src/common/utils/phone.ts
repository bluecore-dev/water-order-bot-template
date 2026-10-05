/**
 * Phone handling. Numbers are stored in E.164 (`+998901234567`). Uzbek numbers may be typed
 * in local form (`90 123 45 67`); foreign numbers are accepted only with an explicit `+`.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');

  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  // Telegram contacts arrive without "+", so a full international number is trusted there too.
  if (digits.length >= 10 && digits.length <= 15 && (hasPlus || !digits.startsWith('0'))) {
    if (digits.startsWith('998') && digits.length !== 12) return null;
    return `+${digits}`;
  }
  return null;
}

/** `+998901234567` → `+998 90 123 45 67`; other numbers are returned unchanged. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}

/**
 * Key used to match the same person across systems (amoCRM stores phones in any format):
 * the last 9 digits identify an Uzbek subscriber regardless of prefix style.
 */
export function phoneMatchKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : null;
}

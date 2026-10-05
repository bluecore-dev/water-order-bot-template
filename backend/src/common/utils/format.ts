/** 45000 → "45 000". Amounts are whole so‘m (UZS has no minor unit in practice). */
export function formatAmount(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return sign + String(Math.abs(Math.trunc(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Every user- or admin-supplied string rendered with parse_mode=HTML must pass through this. */
export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => HTML_ESCAPES[ch]);
}

export function truncate(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : `${chars.slice(0, max - 1).join('')}…`;
}

/** Parses admin input like "15 000", "15000", "15.000" into a whole number; null if not a number. */
export function parseAmountInput(input: string): number | null {
  const cleaned = input.replace(/[\s.,'’`]/g, '').replace(/(so[‘'’`]?m|sum|uzs)$/i, '');
  if (!/^\d{1,12}$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) ? value : null;
}

export function yandexMapLink(latitude: number, longitude: number): string {
  return `https://yandex.uz/maps/?pt=${longitude},${latitude}&z=17&l=map`;
}

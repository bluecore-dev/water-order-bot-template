/**
 * Last line of defence against secrets in logs. Network errors from the Telegram client can
 * embed the full `https://api.telegram.org/bot<TOKEN>/method` URL, and amoCRM errors may echo
 * request bodies, so everything that reaches the logger is passed through here.
 */
const PATTERNS: Array<[RegExp, string]> = [
  [/\d{5,}:[A-Za-z0-9_-]{30,}/g, '[REDACTED_BOT_TOKEN]'],
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, '$1[REDACTED]'],
  [/("?(?:access_token|refresh_token|client_secret|code|password|secret)"?\s*[:=]\s*"?)[^"&\s,}]+/gi, '$1[REDACTED]'],
];

export function redactSecrets(value: string): string {
  let out = value;
  for (const [re, replacement] of PATTERNS) out = out.replace(re, replacement);
  return out;
}

/** Message suitable for logs and for the admin-facing sync error column. */
export function safeErrorMessage(err: unknown, max = 500): string {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
  return redactSecrets(message ?? 'Unknown error').slice(0, max);
}

import { decryptSecret, encryptSecret, signToken, verifyToken } from '../../src/common/utils/crypto';
import { escapeHtml, formatAmount, parseAmountInput } from '../../src/common/utils/format';
import { formatPhone, normalizePhone, phoneMatchKey } from '../../src/common/utils/phone';
import { redactSecrets } from '../../src/common/utils/redact';
import { formatDateTime, startOfDayInTz } from '../../src/common/utils/time';

describe('phone', () => {
  it.each([
    ['+998 90 123 45 67', '+998901234567'],
    ['998901234567', '+998901234567'],
    ['90 123-45-67', '+998901234567'],
    ['(90) 1234567', '+998901234567'],
    ['+7 916 123 45 67', '+79161234567'],
  ])('normalizes %s', (input, expected) => expect(normalizePhone(input)).toBe(expected));

  it.each(['12345', '+998 90 123', 'abc', '', '0901234567890', '99890123456'])('rejects %s', (input) =>
    expect(normalizePhone(input)).toBeNull(),
  );

  it('formats and builds match keys', () => {
    expect(formatPhone('+998901234567')).toBe('+998 90 123 45 67');
    expect(phoneMatchKey('+998 (90) 123-45-67')).toBe('901234567');
    expect(phoneMatchKey('8 90 123 45 67')).toBe('901234567');
  });
});

describe('format', () => {
  it('formats amounts with spaces', () => {
    expect(formatAmount(45000)).toBe('45 000');
    expect(formatAmount(1500000)).toBe('1 500 000');
    expect(formatAmount(900)).toBe('900');
  });

  it('parses admin price input', () => {
    expect(parseAmountInput('15 000')).toBe(15000);
    expect(parseAmountInput('15.000')).toBe(15000);
    expect(parseAmountInput("17000 so'm")).toBe(17000);
    expect(parseAmountInput('abc')).toBeNull();
    expect(parseAmountInput('-5')).toBeNull();
  });

  it('escapes HTML', () => {
    expect(escapeHtml('<b>"x" & y</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;');
  });
});

describe('crypto', () => {
  const key = Buffer.alloc(32, 7);

  it('round-trips encrypted secrets and detects tampering', () => {
    const enc = encryptSecret('refresh-token-value', key);
    expect(enc).not.toContain('refresh-token-value');
    expect(decryptSecret(enc, key)).toBe('refresh-token-value');
    const parts = enc.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), key)).toThrow();
    expect(() => decryptSecret(enc, Buffer.alloc(32, 8))).toThrow();
  });

  it('signs and verifies short-lived tokens', () => {
    const token = signToken({ tg: '1' }, 'secret-secret-secret-secret-secret!', 60);
    expect(verifyToken(token, 'secret-secret-secret-secret-secret!')).toMatchObject({ tg: '1' });
    expect(verifyToken(token, 'another-secret-another-secret-12345')).toBeNull();
    expect(verifyToken(token.slice(0, -2) + 'xx', 'secret-secret-secret-secret-secret!')).toBeNull();
    const expired = signToken({ tg: '1' }, 's'.repeat(32), -1);
    expect(verifyToken(expired, 's'.repeat(32))).toBeNull();
  });
});

describe('redactSecrets', () => {
  it('removes bot tokens and bearer tokens from log text', () => {
    const msg = 'request to https://api.telegram.org/bot1234567890:AAFakeFakeFakeFakeFakeFakeFakeFake12/getMe failed';
    expect(redactSecrets(msg)).not.toContain("AAFakeFake");
    expect(redactSecrets('Authorization: Bearer abcdefghijklmnopqrstuvwxyz123')).not.toContain('abcdefghijklmnop');
    expect(redactSecrets('{"refresh_token":"def50200abc"}')).not.toContain('def50200abc');
  });
});

describe('time', () => {
  it('computes the business day in Asia/Tashkent regardless of server timezone', () => {
    // 2026-10-05 21:30 UTC is already 2026-10-06 02:30 in Tashkent (UTC+5).
    const instant = new Date('2026-10-05T21:30:00Z');
    expect(startOfDayInTz(instant, 'Asia/Tashkent').toISOString()).toBe('2026-10-05T19:00:00.000Z');
    expect(startOfDayInTz(instant, 'Asia/Tashkent', -6).toISOString()).toBe('2026-09-29T19:00:00.000Z');
    expect(formatDateTime(instant, 'Asia/Tashkent')).toBe('06.10.2026 02:30');
  });
});

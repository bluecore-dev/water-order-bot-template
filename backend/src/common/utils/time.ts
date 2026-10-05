/**
 * Timezone helpers. The VPS clock may be in any zone; the business day is always counted in
 * APP_TIMEZONE (Asia/Tashkent by default), so "today" never depends on where the server runs.
 */
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Offset of `timeZone` from UTC at `date`, in milliseconds. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** UTC instant of local midnight (in `timeZone`) for the day containing `date`, shifted by `addDays`. */
export function startOfDayInTz(date: Date, timeZone: string, addDays = 0): Date {
  const p = zonedParts(date, timeZone);
  const localMidnightAsUtc = Date.UTC(p.year, p.month - 1, p.day + addDays);
  const guess = new Date(localMidnightAsUtc - tzOffsetMs(date, timeZone));
  // Re-evaluate the offset at the guessed instant in case a DST boundary lies in between.
  return new Date(localMidnightAsUtc - tzOffsetMs(guess, timeZone));
}

/** "05.10.2026 14:30" in the business timezone. */
export function formatDateTime(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(p.day)}.${pad(p.month)}.${p.year} ${pad(p.hour)}:${pad(p.minute)}`;
}

export function formatDate(date: Date, timeZone: string): string {
  return formatDateTime(date, timeZone).slice(0, 10);
}

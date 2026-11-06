/**
 * Days and months as the shop sees them (Asia/Bangkok, UTC+7, no daylight saving), whatever
 * time zone the server runs in. A date picked on screen ("2026-11-05") means that Bangkok day.
 */
const OFFSET_MS = 7 * 3600_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** First moment of a Bangkok day ("YYYY-MM-DD"); any other string is parsed as given */
export const bkkDayStart = (s: string) => new Date(DATE_ONLY.test(s) ? `${s}T00:00:00.000+07:00` : s);

/** First moment of the Bangkok day after it: use with `lt` */
export const bkkDayAfter = (s: string) =>
  DATE_ONLY.test(s) ? new Date(bkkDayStart(s).getTime() + 86_400_000) : new Date(s);

/** Last moment of a Bangkok day: use with `lte` */
export const bkkDayEnd = (s: string) => new Date(bkkDayAfter(s).getTime() - 1);

/** "YYYY-MM" of a moment, in Bangkok */
export const bkkMonthKey = (d: Date) => new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 7);

/** First moment of the Bangkok month `back` months before the current one */
export function bkkMonthStart(back = 0, now = new Date()): Date {
  const b = new Date(now.getTime() + OFFSET_MS);
  const first = Date.UTC(b.getUTCFullYear(), b.getUTCMonth() - back, 1);
  return new Date(first - OFFSET_MS);
}

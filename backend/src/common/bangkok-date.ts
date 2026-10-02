// Calendar dates in Thailand time (UTC+7, no DST). `new Date().toISOString()` gives the UTC date,
// which between 00:00 and 06:59 Bangkok time is still "yesterday".
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** YYYY-MM-DD in Bangkok time */
export function bangkokDate(d: Date = new Date()): string {
  return new Date(d.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYYMMDD in Bangkok time (document numbers) */
export function bangkokYmd(d: Date = new Date()): string {
  return bangkokDate(d).replace(/-/g, '');
}

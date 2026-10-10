/**
 * FixITPro's own LINE Official Account. A customer taps "รับแจ้งเตือนทาง LINE" on the tracking
 * page; LINE opens the chat with "ติดตามงาน REP-…" ready to send; sending it makes them follow
 * that one repair. The shop sets nothing up.
 */
export const centralLine = () => {
  const oaId = process.env.LINE_OA_ID?.trim() ?? '';
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ?? '';
  const secret = process.env.LINE_CHANNEL_SECRET?.trim() ?? '';
  return { oaId, token, ready: !!(oaId && token && secret) };
};

export const FOLLOW_PREFIX = 'ติดตามงาน';

/** The LINE link that opens FixITPro's chat with the follow message typed in. */
export function followLink(oaId: string, ticketNumber: string): string {
  const id = oaId.startsWith('@') ? oaId : `@${oaId}`;
  return `https://line.me/R/oaMessage/${encodeURIComponent(id)}/?${encodeURIComponent(`${FOLLOW_PREFIX} ${ticketNumber}`)}`;
}

/** "ติดตามงาน REP-20261002-A1B2C3" (or the ticket number alone) → the ticket number. */
export function ticketFromMessage(text: string): string | null {
  const m = text.trim().toUpperCase().match(/\b(REP-[A-Z0-9]+(?:-[A-Z0-9]+)*)\b/);
  return m ? m[1] : null;
}

/** Statuses worth a LINE message (each push counts against the OA's monthly quota). */
export const PUSH_STATUSES = new Set(['WAITING_APPROVAL', 'WAITING_PARTS', 'COMPLETED', 'READY_PICKUP', 'DELIVERED', 'CANCELLED']);
export const END_STATUSES = new Set(['DELIVERED', 'CANCELLED']);

/** The shop's site for the tracking link in messages: the first https origin allowed for the web app. */
export function siteOrigin(): string {
  const first = (process.env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim()).find((s) => s.startsWith('https://'));
  return first ?? 'https://fixitpro.in.th';
}

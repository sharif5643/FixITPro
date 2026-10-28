import { createHmac, timingSafeEqual } from 'crypto';

/**
 * The link on a printed receipt that opens it online (/r/<saleId>/<token>). The token is a
 * signature of the sale id, so only someone holding the receipt (or the link) can open it.
 */
function secret(): string {
  return `receipt:${process.env.JWT_SECRET ?? ''}`;
}

export function receiptToken(saleId: string): string {
  return createHmac('sha256', secret()).update(saleId).digest('base64url').slice(0, 22);
}

export function receiptTokenOk(saleId: string, token: string): boolean {
  const want = Buffer.from(receiptToken(saleId));
  const got = Buffer.from(String(token ?? ''));
  return want.length === got.length && timingSafeEqual(want, got);
}

export function receiptPath(saleId: string): string {
  return `/r/${saleId}/${receiptToken(saleId)}`;
}

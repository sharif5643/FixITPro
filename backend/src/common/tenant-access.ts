/**
 * One rule for when a shop may keep working, shared by the API guard, the subscription
 * status and (copied) the web app: after the expiry date a shop has TENANT_GRACE_DAYS more
 * days; after that it can still read its data but cannot save anything. A suspended shop
 * is read-only straight away.
 */
export const TENANT_GRACE_DAYS = 7;

export const TENANT_BLOCK = {
  EXPIRED:   'TENANT_EXPIRED',
  SUSPENDED: 'TENANT_SUSPENDED',
} as const;

export const TENANT_BLOCK_MESSAGE = {
  EXPIRED:   'แพ็กเกจหมดอายุแล้ว ระบบเปิดให้ดูข้อมูลได้อย่างเดียว กรุณาต่ออายุก่อนบันทึกข้อมูล',
  SUSPENDED: 'ร้านถูกระงับการใช้งานชั่วคราว ระบบเปิดให้ดูข้อมูลได้อย่างเดียว กรุณาติดต่อผู้ดูแลระบบ',
} as const;

export function graceEndOf(expiryDate: Date): Date {
  const end = new Date(expiryDate);
  end.setDate(end.getDate() + TENANT_GRACE_DAYS);
  return end;
}

/** Why a shop may not save right now, or null when it may. */
export function tenantWriteBlock(
  tenant: { status?: string | null; expiryDate?: Date | null } | null | undefined,
  now = new Date(),
): keyof typeof TENANT_BLOCK | null {
  if (!tenant) return null;
  if (tenant.status === 'SUSPENDED') return 'SUSPENDED';
  if (tenant.expiryDate && now > graceEndOf(tenant.expiryDate)) return 'EXPIRED';
  return null;
}

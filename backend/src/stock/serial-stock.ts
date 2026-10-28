import { BadRequestException } from '@nestjs/common';

/**
 * Phones and other items sold by IMEI / serial: the number in stock and the serials marked
 * IN_STOCK must move together, or the shop has a phone it cannot sell (no serial to pick) or a
 * serial with no phone. Every way stock comes in or goes out for such a product goes through here.
 */
export function cleanSerials(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out = list.map((s) => String(s ?? '').trim()).filter(Boolean);
  const seen = new Set<string>();
  const dup = out.filter((s) => (seen.has(s) ? true : (seen.add(s), false)));
  if (dup.length) throw new BadRequestException(`IMEI ซ้ำในรายการ: ${[...new Set(dup)].join(', ')}`);
  if (out.some((s) => s.length > 50)) throw new BadRequestException('IMEI ยาวเกิน 50 ตัวอักษร');
  return out;
}

/** New serials in stock for units coming in; one per unit, none already known to the system. */
export async function addSerialsInStock(
  tx: any,
  productId: string,
  serials: string[],
  quantity: number,
  note?: string,
): Promise<void> {
  if (serials.length !== quantity) {
    throw new BadRequestException(`สินค้านี้ใช้ IMEI — ใส่ IMEI ให้ครบ ${quantity} เครื่อง (ใส่มา ${serials.length})`);
  }
  if (!serials.length) return;
  const taken = await tx.serialNumber.findMany({ where: { serial: { in: serials } }, select: { serial: true } });
  if (taken.length) {
    throw new BadRequestException(`IMEI นี้มีในระบบแล้ว: ${taken.map((t: { serial: string }) => t.serial).join(', ')}`);
  }
  await tx.serialNumber.createMany({
    data: serials.map((serial) => ({ serial, productId, status: 'IN_STOCK', ...(note ? { note } : {}) })),
  });
}

/**
 * Units going out without a sale (broken, back to the supplier…): the serials leave stock too.
 * Units counted in stock with no IMEI recorded (older data) can go out without one, so a shop can
 * bring the count back down to the IMEIs it really has.
 */
export async function takeSerialsOutOfStock(
  tx: any,
  productId: string,
  serialIds: unknown,
  quantity: number,
  note?: string,
  /** What the units become: written off as given to a customer, claimed or broken. Default broken */
  status: 'DEFECTIVE' | 'SOLD' | 'CLAIMED' = 'DEFECTIVE',
): Promise<string[]> {
  const ids = Array.isArray(serialIds) ? [...new Set(serialIds.map(String))] : [];
  if (ids.length > quantity) {
    throw new BadRequestException(`เลือก IMEI มา ${ids.length} เครื่อง มากกว่าจำนวนที่ตัดออก ${quantity}`);
  }
  if (ids.length < quantity) {
    const [product, withSerial] = await Promise.all([
      tx.product.findUnique({ where: { id: productId }, select: { stock: true } }),
      tx.serialNumber.count({ where: { productId, status: 'IN_STOCK' } }),
    ]);
    const withoutSerial = Math.max(0, (product?.stock ?? 0) - withSerial);
    if (quantity - ids.length > withoutSerial) {
      throw new BadRequestException(`สินค้านี้ใช้ IMEI — เลือก IMEI ที่จะตัดออกให้ครบ ${quantity} เครื่อง (เลือกมา ${ids.length})`);
    }
  }
  if (!ids.length) return [];
  const rows = await tx.serialNumber.findMany({
    where: { id: { in: ids }, productId, status: 'IN_STOCK' },
    select: { id: true, serial: true },
  });
  if (rows.length !== ids.length) throw new BadRequestException('มี IMEI ที่ไม่ได้อยู่ในสต๊อกของสินค้านี้');
  await tx.serialNumber.updateMany({
    where: { id: { in: ids } },
    data: { status, ...(note ? { note } : {}) },
  });
  return rows.map((r: { serial: string }) => r.serial);
}

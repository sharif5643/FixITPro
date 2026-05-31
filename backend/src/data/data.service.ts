import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';

// ── CSV helpers ───────────────────────────────────────────────────────────────

const BOM = '﻿';

function esc(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

function buildCSV(headers: string[], rows: unknown[][]): string {
  return BOM + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}

function dateTag(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseCSVRows(raw: string): string[][] {
  const text = raw.startsWith(BOM) ? raw.slice(1) : raw;
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const result: string[][] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const row: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        row.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    row.push(cur.trim());
    result.push(row);
  }
  return result;
}

function buildWhere(startDate?: string, endDate?: string, field = 'createdAt') {
  if (!startDate && !endDate) return undefined;
  const w: any = {};
  if (startDate) w.gte = new Date(startDate);
  if (endDate) {
    const e = new Date(endDate); e.setDate(e.getDate() + 1); w.lt = e;
  }
  return { [field]: w };
}

// ── Export result type ────────────────────────────────────────────────────────

interface ExportResult { filename: string; content: string; rowCount: number }

// ── Import result ─────────────────────────────────────────────────────────────

export interface ImportResult {
  imported: number;
  skipped:  number;
  errors:   { row: number; message: string }[];
}

export interface PreviewResult {
  headers: string[];
  rows: { data: string[]; valid: boolean; errors: string[] }[];
  stats: { total: number; valid: number; invalid: number };
}

// ── Templates ─────────────────────────────────────────────────────────────────

const PRODUCT_HEADERS = [
  'ชื่อสินค้า', 'SKU', 'บาร์โค้ด', 'ประเภท(PHONE/SIM/ACCESSORY/PART)',
  'ราคาขาย', 'ต้นทุน', 'สต็อก', 'สต็อกขั้นต่ำ',
];
const CUSTOMER_HEADERS = ['ชื่อ', 'เบอร์โทร', 'อีเมล', 'ที่อยู่', 'หมายเหตุ'];

@Injectable()
export class DataService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private notif: NotificationsService,
  ) {}

  // ── Export dispatcher ───────────────────────────────────────────────────────

  async export(
    type: string,
    query: { startDate?: string; endDate?: string },
    actorId?: string,
    actorName?: string,
  ): Promise<ExportResult> {
    let result: ExportResult;
    switch (type) {
      case 'customers':       result = await this.exportCustomers(query);       break;
      case 'products':        result = await this.exportProducts(query);        break;
      case 'stock-movements': result = await this.exportStockMovements(query);  break;
      case 'sales':           result = await this.exportSales(query);           break;
      case 'repairs':         result = await this.exportRepairs(query);         break;
      case 'expenses':        result = await this.exportExpenses(query);        break;
      case 'warranties':      result = await this.exportWarranties(query);      break;
      case 'audit-logs':      result = await this.exportAuditLogs(query);       break;
      default:
        throw new BadRequestException(`Unknown export type: ${type}`);
    }
    await this.auditLog.log({
      actorId, actorName,
      action: 'DATA_EXPORTED',
      entityType: 'Export',
      afterData: { type, rowCount: result.rowCount, filename: result.filename },
    });
    return result;
  }

  // ── Individual exports ──────────────────────────────────────────────────────

  private async exportCustomers(q: { startDate?: string; endDate?: string }): Promise<ExportResult> {
    const rows = await this.prisma.customer.findMany({
      where: buildWhere(q.startDate, q.endDate) ?? undefined,
      select: { id: true, name: true, phone: true, email: true, address: true, note: true, points: true, tags: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const content = buildCSV(
      ['ID', 'ชื่อ', 'เบอร์โทร', 'อีเมล', 'ที่อยู่', 'หมายเหตุ', 'คะแนน', 'แท็ก', 'วันสมัคร'],
      rows.map((r) => [r.id, r.name, r.phone ?? '', r.email ?? '', r.address ?? '', r.note ?? '', r.points, r.tags.join(';'), r.createdAt.toISOString()]),
    );
    return { filename: `customers_${dateTag()}.csv`, content, rowCount: rows.length };
  }

  private async exportProducts(q: { startDate?: string; endDate?: string }): Promise<ExportResult> {
    const rows = await this.prisma.product.findMany({
      where: buildWhere(q.startDate, q.endDate) ?? undefined,
      include: { category: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    const content = buildCSV(
      ['ID', 'ชื่อสินค้า', 'SKU', 'บาร์โค้ด', 'ประเภท', 'ราคาขาย', 'ต้นทุน', 'สต็อก', 'สต็อกขั้นต่ำ', 'หมวดหมู่', 'รับประกัน (วัน)', 'สถานะ', 'วันที่เพิ่ม'],
      rows.map((r) => [
        r.id, r.name, r.sku, r.barcode ?? '', r.type, Number(r.price), Number(r.costPrice),
        r.stock, r.minStock, r.category?.name ?? '', r.warrantyDays ?? '', r.isActive ? 'ใช้งาน' : 'ปิดใช้งาน', r.createdAt.toISOString(),
      ]),
    );
    return { filename: `products_${dateTag()}.csv`, content, rowCount: rows.length };
  }

  private async exportStockMovements(q: { startDate?: string; endDate?: string }): Promise<ExportResult> {
    const rows = await this.prisma.stockMovement.findMany({
      where: buildWhere(q.startDate, q.endDate) ?? undefined,
      include: { product: { select: { name: true, sku: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });
    const content = buildCSV(
      ['ID', 'ประเภท', 'สินค้า', 'SKU', 'จำนวน', 'อ้างอิงประเภท', 'อ้างอิง ID', 'หมายเหตุ', 'วันที่'],
      rows.map((r) => [r.id, r.type, r.product.name, r.product.sku, r.quantity, r.referenceType ?? '', r.referenceId ?? '', r.note ?? '', r.createdAt.toISOString()]),
    );
    return { filename: `stock_movements_${dateTag()}.csv`, content, rowCount: rows.length };
  }

  private async exportSales(q: { startDate?: string; endDate?: string }): Promise<ExportResult> {
    const rows = await this.prisma.sale.findMany({
      where: buildWhere(q.startDate, q.endDate) ?? undefined,
      include: { customer: { select: { name: true } }, user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });
    const content = buildCSV(
      ['เลขที่ใบเสร็จ', 'สถานะ', 'ลูกค้า', 'ส่วนลด', 'ยอดรวม', 'ชำระ', 'เงินทอน', 'วิธีชำระ', 'แคชเชียร์', 'วันที่'],
      rows.map((r) => [
        r.receiptNumber, r.status, r.customer?.name ?? 'ลูกค้าทั่วไป',
        Number(r.discount), Number(r.total), Number(r.amountPaid), Number(r.change),
        r.paymentMethod, r.user.name, r.createdAt.toISOString(),
      ]),
    );
    return { filename: `sales_${dateTag()}.csv`, content, rowCount: rows.length };
  }

  private async exportRepairs(q: { startDate?: string; endDate?: string }): Promise<ExportResult> {
    const rows = await this.prisma.repair.findMany({
      where: buildWhere(q.startDate, q.endDate, 'receivedAt') ?? undefined,
      include: {
        customer:   { select: { name: true, phone: true } },
        technician: { select: { name: true } },
      },
      orderBy: { receivedAt: 'desc' },
      take: 10_000,
    });
    const content = buildCSV(
      ['เลขงาน', 'แบรนด์', 'รุ่น', 'IMEI', 'ปัญหา', 'สถานะ', 'ช่างซ่อม', 'ลูกค้า', 'เบอร์ลูกค้า',
       'ราคาประเมิน', 'ราคาจริง', 'มัดจำ', 'สถานะชำระ', 'วันรับ', 'วันซ่อมเสร็จ', 'วันส่งมอบ'],
      rows.map((r) => [
        r.ticketNumber, r.deviceBrand, r.deviceModel, r.deviceImei ?? '', r.issue,
        r.status, r.technician?.name ?? '', r.customer?.name ?? '', r.customer?.phone ?? '',
        r.estimateCost != null ? Number(r.estimateCost) : '',
        r.finalCost != null ? Number(r.finalCost) : '',
        Number(r.deposit), r.paymentStatus,
        r.receivedAt.toISOString(),
        r.completedAt?.toISOString() ?? '',
        r.deliveredAt?.toISOString() ?? '',
      ]),
    );
    return { filename: `repairs_${dateTag()}.csv`, content, rowCount: rows.length };
  }

  private async exportExpenses(q: { startDate?: string; endDate?: string }): Promise<ExportResult> {
    const rows = await this.prisma.expense.findMany({
      where: buildWhere(q.startDate, q.endDate, 'expenseDate') ?? undefined,
      include: {
        category:  { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { expenseDate: 'desc' },
    });
    const content = buildCSV(
      ['ID', 'วันที่', 'หมวดหมู่', 'รายการ', 'จำนวนเงิน', 'วิธีชำระ', 'เลขอ้างอิง', 'หมายเหตุ', 'ผู้บันทึก', 'ยกเลิก'],
      rows.map((r) => [
        r.id, r.expenseDate.toISOString().slice(0, 10), r.category.name, r.description,
        Number(r.amount), r.paymentMethod, r.referenceNo ?? '', r.note ?? '',
        r.createdBy.name, r.voidedAt ? 'ยกเลิก' : '',
      ]),
    );
    return { filename: `expenses_${dateTag()}.csv`, content, rowCount: rows.length };
  }

  private async exportWarranties(q: { startDate?: string; endDate?: string }): Promise<ExportResult> {
    const rows = await (this.prisma as any).warranty.findMany({
      where: buildWhere(q.startDate, q.endDate) ?? undefined,
      include: {
        customer:  { select: { name: true, phone: true } },
        repair:    { select: { ticketNumber: true } },
        saleItem:  { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const content = buildCSV(
      ['เลขที่รับประกัน', 'ประเภท', 'สถานะ', 'ลูกค้า', 'เบอร์', 'งานซ่อม/สินค้า', 'วันเริ่ม', 'วันหมด', 'คำอธิบาย', 'หมายเหตุ'],
      rows.map((r: any) => [
        r.warrantyNumber, r.sourceType, r.status,
        r.customer?.name ?? '', r.customer?.phone ?? '',
        r.repair?.ticketNumber ?? r.saleItem?.product?.name ?? '',
        new Date(r.startDate).toISOString().slice(0, 10),
        new Date(r.endDate).toISOString().slice(0, 10),
        r.description ?? '', r.notes ?? '',
      ]),
    );
    return { filename: `warranties_${dateTag()}.csv`, content, rowCount: rows.length };
  }

  private async exportAuditLogs(q: { startDate?: string; endDate?: string }): Promise<ExportResult> {
    const rows = await this.prisma.auditLog.findMany({
      where: buildWhere(q.startDate, q.endDate) ?? undefined,
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });
    const content = buildCSV(
      ['ID', 'ผู้ทำรายการ', 'การกระทำ', 'ประเภทข้อมูล', 'ID ข้อมูล', 'IP', 'วันที่เวลา'],
      rows.map((r) => [r.id, r.actorName ?? '', r.action, r.entityType, r.entityId ?? '', r.ipAddress ?? '', r.createdAt.toISOString()]),
    );
    return { filename: `audit_logs_${dateTag()}.csv`, content, rowCount: rows.length };
  }

  // ── Templates ───────────────────────────────────────────────────────────────

  getTemplate(type: string): { filename: string; content: string } {
    if (type === 'products') {
      const example = [['ไอโฟน 15', 'IP15-128', '', 'PHONE', '32900', '28000', '10', '2']];
      return { filename: 'products_template.csv', content: buildCSV(PRODUCT_HEADERS, example) };
    }
    if (type === 'customers') {
      const example = [['สมชาย ใจดี', '0812345678', 'somchai@email.com', 'กรุงเทพ', '']];
      return { filename: 'customers_template.csv', content: buildCSV(CUSTOMER_HEADERS, example) };
    }
    throw new BadRequestException(`No template for type: ${type}`);
  }

  // ── Preview (validate only, no DB write) ───────────────────────────────────

  async preview(type: string, csvContent: string): Promise<PreviewResult> {
    const allRows = parseCSVRows(csvContent);
    if (allRows.length < 2) {
      return { headers: [], rows: [], stats: { total: 0, valid: 0, invalid: 0 } };
    }
    const [rawHeaders, ...dataRows] = allRows;

    if (type === 'products') return this.previewProducts(rawHeaders, dataRows);
    if (type === 'customers') return this.previewCustomers(rawHeaders, dataRows);
    throw new BadRequestException(`Import not supported for type: ${type}`);
  }

  private async previewProducts(headers: string[], dataRows: string[][]): Promise<PreviewResult> {
    const existing = await this.prisma.product.findMany({ select: { sku: true, barcode: true } });
    const skuSet  = new Set(existing.map((p) => p.sku.toLowerCase()));
    const bcSet   = new Set(existing.filter((p) => p.barcode).map((p) => p.barcode!.toLowerCase()));

    const rows = dataRows.map((row) => {
      const errors: string[] = [];
      const [name, sku, barcode, type, price, cost, stock, minStock] = row;

      if (!name?.trim())  errors.push('ชื่อสินค้าจำเป็น');
      if (!sku?.trim())   errors.push('SKU จำเป็น');
      if (sku && skuSet.has(sku.trim().toLowerCase())) errors.push(`SKU "${sku}" มีอยู่แล้ว`);
      if (barcode?.trim() && bcSet.has(barcode.trim().toLowerCase())) errors.push(`บาร์โค้ด "${barcode}" มีอยู่แล้ว`);
      if (!type?.trim() || !['PHONE', 'SIM', 'ACCESSORY', 'PART'].includes(type.trim().toUpperCase())) {
        errors.push('ประเภทต้องเป็น PHONE, SIM, ACCESSORY หรือ PART');
      }
      if (!price || isNaN(Number(price)) || Number(price) < 0) errors.push('ราคาขายไม่ถูกต้อง');
      if (!cost  || isNaN(Number(cost))  || Number(cost)  < 0) errors.push('ต้นทุนไม่ถูกต้อง');

      return { data: row, valid: errors.length === 0, errors };
    });

    const valid   = rows.filter((r) => r.valid).length;
    const invalid = rows.length - valid;
    return { headers, rows, stats: { total: rows.length, valid, invalid } };
  }

  private async previewCustomers(headers: string[], dataRows: string[][]): Promise<PreviewResult> {
    const existing = await this.prisma.customer.findMany({ select: { phone: true } });
    const phoneSet = new Set(existing.filter((c) => c.phone).map((c) => c.phone!.replace(/\D/g, '')));

    const rows = dataRows.map((row) => {
      const errors: string[] = [];
      const [name, phone] = row;

      if (!name?.trim()) errors.push('ชื่อจำเป็น');
      if (phone?.trim()) {
        const digits = phone.trim().replace(/\D/g, '');
        if (phoneSet.has(digits)) errors.push(`เบอร์โทร "${phone}" มีอยู่แล้ว`);
      }

      return { data: row, valid: errors.length === 0, errors };
    });

    const valid   = rows.filter((r) => r.valid).length;
    const invalid = rows.length - valid;
    return { headers, rows, stats: { total: rows.length, valid, invalid } };
  }

  // ── Import (save valid rows) ────────────────────────────────────────────────

  async import(
    type: string,
    csvContent: string,
    actorId?: string,
    actorName?: string,
  ): Promise<ImportResult> {
    const preview = await this.preview(type, csvContent);
    let result: ImportResult;

    if (type === 'products')  result = await this.importProducts(preview);
    else if (type === 'customers') result = await this.importCustomers(preview);
    else throw new BadRequestException(`Import not supported for type: ${type}`);

    // Audit log
    await this.auditLog.log({
      actorId, actorName,
      action: 'DATA_IMPORTED',
      entityType: 'Import',
      afterData: { type, imported: result.imported, skipped: result.skipped, errors: result.errors.length },
    });

    // Notification
    if (result.imported > 0) {
      await this.notif.notify({
        type:     'IMPORT_COMPLETED',
        title:    `นำเข้าข้อมูลสำเร็จ: ${type}`,
        message:  `นำเข้า ${result.imported} รายการ${result.skipped > 0 ? `, ข้าม ${result.skipped} รายการซ้ำ` : ''}${result.errors.length > 0 ? `, มีข้อผิดพลาด ${result.errors.length} แถว` : ''}`,
        severity: result.errors.length > 0 ? 'WARNING' : 'INFO',
      });
    } else {
      await this.notif.notify({
        type:     'IMPORT_FAILED',
        title:    `นำเข้าข้อมูลล้มเหลว: ${type}`,
        message:  `ไม่มีข้อมูลที่นำเข้าได้ — มีข้อผิดพลาด ${result.errors.length} แถว`,
        severity: 'ERROR',
      });
    }

    return result;
  }

  private async importProducts(preview: PreviewResult): Promise<ImportResult> {
    const errors: { row: number; message: string }[] = [];
    let imported = 0;
    let skipped  = 0;

    for (let i = 0; i < preview.rows.length; i++) {
      const r = preview.rows[i];
      if (!r.valid) {
        if (r.errors.some((e) => e.includes('มีอยู่แล้ว'))) {
          skipped++;
        } else {
          errors.push({ row: i + 2, message: r.errors.join('; ') });
        }
        continue;
      }
      const [name, sku, barcode, type, price, cost, stock, minStock] = r.data;
      try {
        await this.prisma.product.create({
          data: {
            name:      name.trim(),
            sku:       sku.trim(),
            barcode:   barcode?.trim() || null,
            type:      type.trim().toUpperCase() as any,
            price:     Number(price),
            costPrice: Number(cost),
            stock:     stock ? Math.max(0, parseInt(stock)) : 0,
            minStock:  minStock ? Math.max(0, parseInt(minStock)) : 0,
          },
        });
        imported++;
      } catch (err: any) {
        errors.push({ row: i + 2, message: err?.message ?? 'บันทึกไม่สำเร็จ' });
      }
    }
    return { imported, skipped, errors };
  }

  private async importCustomers(preview: PreviewResult): Promise<ImportResult> {
    const errors: { row: number; message: string }[] = [];
    let imported = 0;
    let skipped  = 0;

    for (let i = 0; i < preview.rows.length; i++) {
      const r = preview.rows[i];
      if (!r.valid) {
        if (r.errors.some((e) => e.includes('มีอยู่แล้ว'))) {
          skipped++;
        } else {
          errors.push({ row: i + 2, message: r.errors.join('; ') });
        }
        continue;
      }
      const [name, phone, email, address, note] = r.data;
      try {
        await this.prisma.customer.create({
          data: {
            name:    name.trim(),
            phone:   phone?.trim() || null,
            email:   email?.trim() || null,
            address: address?.trim() || null,
            note:    note?.trim() || null,
            tags:    [],
          },
        });
        imported++;
      } catch (err: any) {
        errors.push({ row: i + 2, message: err?.message ?? 'บันทึกไม่สำเร็จ' });
      }
    }
    return { imported, skipped, errors };
  }
}

import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantService } from '../tenant/tenant.service';
import { bangkokDate } from '../common/bangkok-date';
import { canViewCost } from '../common/interceptors/hide-cost.interceptor';

// ── CSV helpers ───────────────────────────────────────────────────────────────

const BOM = '﻿';

/** Who is exporting: decides cost columns and the activity log. */
export interface ExportActor {
  id?: string;
  name?: string;
  role?: string;
  permissions?: string[];
  tenantId?: string | null;
}

// A cell starting with = + - @ is run as a formula by Excel; plain numbers are left alone
const FORMULA_START = /^[=+\-@\t\r]/;
const NUMBER_LIKE   = /^[+-]?\d[\d,.\s]*$/;

function esc(v: unknown): string {
  let s = String(v ?? '');
  if (typeof v === 'string' && FORMULA_START.test(s) && !NUMBER_LIKE.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function buildCSV(headers: string[], rows: unknown[][]): string {
  return BOM + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}

function dateTag(): string {
  return bangkokDate();
}

/**
 * The file's text: UTF-8 (with or without BOM), or Windows-874 / TIS-620, which Excel uses when
 * a Thai Windows machine saves "CSV (Comma delimited)".
 */
export function decodeCsv(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-874').decode(buf);
  }
}

/** CSV rows; a quoted cell may hold commas, quotes ("") and line breaks (an address on two lines). */
export function parseCSVRows(raw: string): string[][] {
  const text = raw.startsWith(BOM) ? raw.slice(1) : raw;
  const result: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  const endRow = () => {
    row.push(cur.trim());
    if (row.some((c) => c !== '')) result.push(row);
    row = []; cur = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur.trim()); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else cur += ch;
  }
  if (cur !== '' || row.length > 0) endRow();
  return result;
}

/** "1,200", "฿ 1200" → 1200; empty or not a number → NaN */
function num(v?: string): number {
  const s = (v ?? '').replace(/[,\s฿]/g, '');
  return s === '' ? NaN : Number(s);
}

/** Excel drops the leading 0 of a Thai phone number (0812345678 → 812345678): put it back. */
export function normalizePhone(v?: string): string {
  const s = (v ?? '').trim();
  return /^[689]\d{8}$/.test(s) ? `0${s}` : s;
}

/** A date range in Bangkok time: the whole of each day from startDate to endDate. */
function buildWhere(startDate?: string, endDate?: string, field = 'createdAt') {
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (startDate && !day.test(startDate)) throw new BadRequestException('วันที่เริ่มต้นไม่ถูกต้อง');
  if (endDate && !day.test(endDate)) throw new BadRequestException('วันที่สิ้นสุดไม่ถูกต้อง');
  if (!startDate && !endDate) return undefined;
  const w: any = {};
  if (startDate) w.gte = new Date(`${startDate}T00:00:00+07:00`);
  if (endDate) w.lt = new Date(new Date(`${endDate}T00:00:00+07:00`).getTime() + 24 * 60 * 60 * 1000);
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
const CUSTOMER_HEADERS  = ['ชื่อ', 'เบอร์โทร', 'อีเมล', 'ที่อยู่', 'หมายเหตุ'];
const CATEGORY_HEADERS  = ['ชื่อหมวดหมู่', 'slug (ไม่บังคับ — ใส่หรือเว้นว่างให้ระบบสร้างเอง)'];
const SUPPLIER_HEADERS  = ['ชื่อบริษัท/ร้าน', 'เบอร์โทร', 'อีเมล', 'ที่อยู่', 'เลขภาษี', 'เครดิต (วัน)', 'หมายเหตุ'];

/**
 * Import columns are found by their heading, in any order, so a file exported from here (with an
 * ID column first) or a template with columns moved still lines up. Each entry: the template
 * heading and the headings it may also have (matched without spaces, case-insensitive; a heading
 * ending in "*" matches as a prefix).
 */
const IMPORT_COLUMNS: Record<string, { headers: string[]; columns: string[][]; required: number[] }> = {
  products: {
    headers: PRODUCT_HEADERS,
    columns: [['ชื่อสินค้า', 'ชื่อ', 'name', 'productname'], ['sku', 'รหัสสินค้า'], ['บาร์โค้ด', 'barcode'], ['ประเภท*', 'type'], ['ราคาขาย', 'ราคา', 'price'], ['ต้นทุน', 'ราคาทุน', 'cost', 'costprice'], ['สต็อก', 'จำนวน', 'stock', 'qty'], ['สต็อกขั้นต่ำ', 'minstock']],
    required: [0, 1],
  },
  customers: {
    headers: CUSTOMER_HEADERS,
    columns: [['ชื่อ', 'ชื่อลูกค้า', 'name'], ['เบอร์โทร', 'เบอร์', 'โทรศัพท์', 'phone'], ['อีเมล', 'email'], ['ที่อยู่', 'address'], ['หมายเหตุ', 'note']],
    required: [0],
  },
  categories: {
    headers: CATEGORY_HEADERS,
    columns: [['ชื่อหมวดหมู่', 'หมวดหมู่', 'ชื่อ', 'name', 'category'], ['slug*']],
    required: [0],
  },
  suppliers: {
    headers: SUPPLIER_HEADERS,
    columns: [['ชื่อบริษัท/ร้าน', 'ชื่อ', 'ซัพพลายเออร์', 'name', 'supplier'], ['เบอร์โทร', 'เบอร์', 'phone'], ['อีเมล', 'email'], ['ที่อยู่', 'address'], ['เลขภาษี', 'เลขประจำตัวผู้เสียภาษี', 'taxid'], ['เครดิต(วัน)*', 'เครดิต*', 'creditdays'], ['หมายเหตุ', 'note']],
    required: [0],
  },
};

const norm = (h: string) => h.replace(/\s+/g, '').toLowerCase();

/** Rows rearranged into the template's column order; an error when a required column is missing. */
function alignColumns(type: string, rawHeaders: string[], dataRows: string[][]): string[][] {
  const spec = IMPORT_COLUMNS[type];
  const heads = rawHeaders.map(norm);
  const index = spec.columns.map((aliases) => {
    for (const a of aliases) {
      const want = norm(a);
      const i = want.endsWith('*')
        ? heads.findIndex((h) => h.startsWith(want.slice(0, -1)))
        : heads.indexOf(want);
      if (i >= 0) return i;
    }
    return -1;
  });
  const missing = spec.required.filter((r) => index[r] < 0).map((r) => spec.headers[r]);
  if (missing.length > 0) {
    throw new BadRequestException(
      `หัวคอลัมน์ไม่ตรงกับแม่แบบ — ไม่พบคอลัมน์: ${missing.join(', ')} (ดาวน์โหลดแม่แบบเพื่อดูหัวคอลัมน์ที่ถูกต้อง)`,
    );
  }
  return dataRows.map((row) => index.map((i) => (i >= 0 ? (row[i] ?? '').trim() : '')));
}

@Injectable()
export class DataService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private notif: NotificationsService,
    private tenantSvc: TenantService,
  ) {}

  // ── Export dispatcher ───────────────────────────────────────────────────────

  async export(
    type: string,
    query: { startDate?: string; endDate?: string },
    actor: ExportActor = {},
  ): Promise<ExportResult> {
    const tenantId = actor.tenantId;
    let result: ExportResult;
    switch (type) {
      case 'customers':       result = await this.exportCustomers(query, tenantId);        break;
      case 'products':        result = await this.exportProducts(query, tenantId, actor);  break;
      case 'stock-movements': result = await this.exportStockMovements(query, tenantId);   break;
      case 'sales':           result = await this.exportSales(query, tenantId);            break;
      case 'repairs':         result = await this.exportRepairs(query, tenantId);          break;
      case 'expenses':        result = await this.exportExpenses(query, tenantId);         break;
      case 'warranties':      result = await this.exportWarranties(query, tenantId);       break;
      case 'audit-logs':      result = await this.exportAuditLogs(query, actor);           break;
      default:
        throw new BadRequestException(`Unknown export type: ${type}`);
    }
    await this.auditLog.log({
      actorId: actor.id, actorName: actor.name,
      action: 'DATA_EXPORTED',
      entityType: 'Export',
      afterData: { type, rowCount: result.rowCount, filename: result.filename },
    });
    return result;
  }

  // ── Individual exports ──────────────────────────────────────────────────────

  private async exportCustomers(q: { startDate?: string; endDate?: string }, tenantId?: string | null): Promise<ExportResult> {
    const rows = await this.prisma.customer.findMany({
      where: { ...buildWhere(q.startDate, q.endDate), ...this.tenantSvc.scope(tenantId) },
      select: { id: true, name: true, phone: true, email: true, address: true, note: true, points: true, tags: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const content = buildCSV(
      ['ID', 'ชื่อ', 'เบอร์โทร', 'อีเมล', 'ที่อยู่', 'หมายเหตุ', 'คะแนน', 'แท็ก', 'วันสมัคร'],
      rows.map((r) => [r.id, r.name, r.phone ?? '', r.email ?? '', r.address ?? '', r.note ?? '', r.points, r.tags.join(';'), r.createdAt.toISOString()]),
    );
    return { filename: `customers_${dateTag()}.csv`, content, rowCount: rows.length };
  }

  private async exportProducts(q: { startDate?: string; endDate?: string }, tenantId: string | null | undefined, actor: ExportActor): Promise<ExportResult> {
    const rows = await this.prisma.product.findMany({
      where: { ...buildWhere(q.startDate, q.endDate), ...this.tenantSvc.scope(tenantId) },
      include: { category: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    // Cost goes in the file only for people who may see it on screen
    const withCost = canViewCost(actor);
    const headers = ['ID', 'ชื่อสินค้า', 'SKU', 'บาร์โค้ด', 'ประเภท', 'ราคาขาย', ...(withCost ? ['ต้นทุน'] : []), 'สต็อก', 'สต็อกขั้นต่ำ', 'หมวดหมู่', 'รับประกัน (วัน)', 'สถานะ', 'วันที่เพิ่ม'];
    const content = buildCSV(
      headers,
      rows.map((r) => [
        r.id, r.name, r.sku, r.barcode ?? '', r.type, Number(r.price), ...(withCost ? [Number(r.costPrice)] : []),
        r.stock, r.minStock, r.category?.name ?? '', r.warrantyDays ?? '', r.isActive ? 'ใช้งาน' : 'ปิดใช้งาน', r.createdAt.toISOString(),
      ]),
    );
    return { filename: `products_${dateTag()}.csv`, content, rowCount: rows.length };
  }

  private async exportStockMovements(q: { startDate?: string; endDate?: string }, tenantId?: string | null): Promise<ExportResult> {
    const rows = await this.prisma.stockMovement.findMany({
      where: { ...buildWhere(q.startDate, q.endDate), ...(tenantId ? { product: { tenantId } } : {}) },
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

  private async exportSales(q: { startDate?: string; endDate?: string }, tenantId?: string | null): Promise<ExportResult> {
    const rows = await this.prisma.sale.findMany({
      where: { ...buildWhere(q.startDate, q.endDate), ...this.tenantSvc.branchScope(tenantId) },
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

  private async exportRepairs(q: { startDate?: string; endDate?: string }, tenantId?: string | null): Promise<ExportResult> {
    const rows = await this.prisma.repair.findMany({
      where: { ...buildWhere(q.startDate, q.endDate, 'receivedAt'), ...this.tenantSvc.branchScope(tenantId) },
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

  private async exportExpenses(q: { startDate?: string; endDate?: string }, tenantId?: string | null): Promise<ExportResult> {
    const rows = await this.prisma.expense.findMany({
      where: { ...buildWhere(q.startDate, q.endDate, 'expenseDate'), ...this.tenantSvc.branchScope(tenantId) },
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

  private async exportWarranties(q: { startDate?: string; endDate?: string }, tenantId?: string | null): Promise<ExportResult> {
    const rows = await this.prisma.warranty.findMany({
      where: { ...buildWhere(q.startDate, q.endDate), ...(tenantId ? { customer: { tenantId } } : {}) },
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

  /**
   * The activity log of this shop only (actions by its own people), for those who may see the
   * activity log page; the system admin gets every shop's.
   */
  private async exportAuditLogs(q: { startDate?: string; endDate?: string }, actor: ExportActor): Promise<ExportResult> {
    const isAdmin = actor.role === 'SUPER_ADMIN';
    if (!isAdmin && actor.role !== 'OWNER' && !(actor.permissions ?? []).includes('audit.view')) {
      throw new ForbiddenException('ส่งออกประวัติกิจกรรมได้เฉพาะคนที่มีสิทธิ์ดูประวัติกิจกรรม');
    }
    let actorScope: Record<string, unknown> = {};
    if (!isAdmin) {
      if (!actor.tenantId) throw new ForbiddenException('ไม่พบร้านของผู้ใช้');
      const users = await this.prisma.user.findMany({ where: { tenantId: actor.tenantId }, select: { id: true } });
      actorScope = { actorId: { in: users.map((u) => u.id) } };
    }
    const rows = await this.prisma.auditLog.findMany({
      where: { ...(buildWhere(q.startDate, q.endDate) ?? {}), ...actorScope },
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
    if (type === 'categories') {
      const example = [
        ['อะไหล่โทรศัพท์', 'phone-parts'],
        ['อุปกรณ์เสริม', ''],
      ];
      return { filename: 'categories_template.csv', content: buildCSV(CATEGORY_HEADERS, example) };
    }
    if (type === 'suppliers') {
      const example = [
        ['บริษัท ABC อะไหล่ จำกัด', '02-123-4567', 'purchase@abc.co.th', 'กรุงเทพ', '0105556789012', '30', ''],
        ['ร้านอะไหล่โกวิท', '081-234-5678', '', '', '', '0', ''],
      ];
      return { filename: 'suppliers_template.csv', content: buildCSV(SUPPLIER_HEADERS, example) };
    }
    throw new BadRequestException(`No template for type: ${type}`);
  }

  // ── Preview (validate only, no DB write) ───────────────────────────────────

  async preview(type: string, csvContent: string, tenantId?: string | null): Promise<PreviewResult> {
    if (!IMPORT_COLUMNS[type]) throw new BadRequestException(`Import not supported for type: ${type}`);
    const allRows = parseCSVRows(csvContent);
    if (allRows.length < 2) {
      return { headers: [], rows: [], stats: { total: 0, valid: 0, invalid: 0 } };
    }
    const [rawHeaders, ...rest] = allRows;
    const dataRows = alignColumns(type, rawHeaders, rest);
    const headers = IMPORT_COLUMNS[type].headers;

    if (type === 'products')   return this.previewProducts(headers, dataRows, tenantId);
    if (type === 'customers')  return this.previewCustomers(headers, dataRows, tenantId);
    if (type === 'categories') return this.previewCategories(headers, dataRows, tenantId);
    return this.previewSuppliers(headers, dataRows, tenantId);
  }

  private result(headers: string[], rows: PreviewResult['rows']): PreviewResult {
    const valid = rows.filter((r) => r.valid).length;
    return { headers, rows, stats: { total: rows.length, valid, invalid: rows.length - valid } };
  }

  private async previewProducts(headers: string[], dataRows: string[][], tenantId?: string | null): Promise<PreviewResult> {
    const existing = await this.prisma.product.findMany({
      where: this.tenantSvc.scope(tenantId),
      select: { sku: true, barcode: true },
    });
    const skuSet  = new Set(existing.map((p) => p.sku.toLowerCase()));
    const bcSet   = new Set(existing.filter((p) => p.barcode).map((p) => p.barcode!.toLowerCase()));
    // The same SKU / barcode twice in this file: the earlier row wins
    const skuRow = new Map<string, number>();
    const bcRow  = new Map<string, number>();

    const rows = dataRows.map((row, i) => {
      const errors: string[] = [];
      const [name, sku, barcode, type, price, cost, stock, minStock] = row;
      const skuKey = sku.toLowerCase();
      const bcKey  = barcode.toLowerCase();

      if (!name)  errors.push('ชื่อสินค้าจำเป็น');
      if (!sku)   errors.push('SKU จำเป็น');
      if (sku && skuSet.has(skuKey)) errors.push(`SKU "${sku}" มีอยู่แล้ว`);
      else if (sku && skuRow.has(skuKey)) errors.push(`SKU "${sku}" ซ้ำกับแถวที่ ${skuRow.get(skuKey)} ในไฟล์`);
      if (barcode && bcSet.has(bcKey)) errors.push(`บาร์โค้ด "${barcode}" มีอยู่แล้ว`);
      else if (barcode && bcRow.has(bcKey)) errors.push(`บาร์โค้ด "${barcode}" ซ้ำกับแถวที่ ${bcRow.get(bcKey)} ในไฟล์`);
      if (!type || !['PHONE', 'SIM', 'ACCESSORY', 'PART'].includes(type.toUpperCase())) {
        errors.push('ประเภทต้องเป็น PHONE, SIM, ACCESSORY หรือ PART');
      }
      if (!(num(price) >= 0)) errors.push('ราคาขายไม่ถูกต้อง');
      if (!(num(cost)  >= 0)) errors.push('ต้นทุนไม่ถูกต้อง');
      if (stock && !(num(stock) >= 0)) errors.push('สต็อกไม่ถูกต้อง');
      if (minStock && !(num(minStock) >= 0)) errors.push('สต็อกขั้นต่ำไม่ถูกต้อง');

      if (sku && !skuRow.has(skuKey)) skuRow.set(skuKey, i + 2);
      if (barcode && !bcRow.has(bcKey)) bcRow.set(bcKey, i + 2);
      return { data: row, valid: errors.length === 0, errors };
    });
    return this.result(headers, rows);
  }

  private async previewCustomers(headers: string[], dataRows: string[][], tenantId?: string | null): Promise<PreviewResult> {
    const existing = await this.prisma.customer.findMany({
      where: this.tenantSvc.scope(tenantId),
      select: { phone: true },
    });
    const digits = (p: string) => p.replace(/\D/g, '');
    const phoneSet = new Set(existing.filter((c) => c.phone).map((c) => digits(c.phone!)));
    const phoneRow = new Map<string, number>();

    const rows = dataRows.map((raw, i) => {
      const row = [...raw];
      row[1] = normalizePhone(row[1]);
      const errors: string[] = [];
      const [name, phone] = row;
      const key = digits(phone);

      if (!name) errors.push('ชื่อจำเป็น');
      if (key) {
        if (phoneSet.has(key)) errors.push(`เบอร์โทร "${phone}" มีอยู่แล้ว`);
        else if (phoneRow.has(key)) errors.push(`เบอร์โทร "${phone}" ซ้ำกับแถวที่ ${phoneRow.get(key)} ในไฟล์`);
        else phoneRow.set(key, i + 2);
      }
      return { data: row, valid: errors.length === 0, errors };
    });
    return this.result(headers, rows);
  }

  // ── Import (save valid rows) ────────────────────────────────────────────────

  async import(
    type: string,
    csvContent: string,
    actorId?: string,
    actorName?: string,
    tenantId?: string | null,
    branchId?: string | null,
  ): Promise<ImportResult> {
    const preview = await this.preview(type, csvContent, tenantId);
    let result: ImportResult;

    if      (type === 'products')   result = await this.importProducts(preview, tenantId, branchId);
    else if (type === 'customers')  result = await this.importCustomers(preview, tenantId);
    else if (type === 'categories') result = await this.importCategories(preview, tenantId);
    else                            result = await this.importSuppliers(preview, tenantId);

    // Audit log
    await this.auditLog.log({
      actorId, actorName,
      action: 'DATA_IMPORTED',
      entityType: 'Import',
      afterData: { type, imported: result.imported, skipped: result.skipped, errors: result.errors.length },
    });

    // Notification (to this shop)
    if (result.imported > 0) {
      await this.notif.notify({
        type:     'IMPORT_COMPLETED',
        title:    `นำเข้าข้อมูลสำเร็จ: ${type}`,
        message:  `นำเข้า ${result.imported} รายการ${result.skipped > 0 ? `, ข้าม ${result.skipped} รายการซ้ำ` : ''}${result.errors.length > 0 ? `, มีข้อผิดพลาด ${result.errors.length} แถว` : ''}`,
        severity: result.errors.length > 0 ? 'WARNING' : 'INFO',
        tenantId: tenantId ?? null,
      });
    } else {
      await this.notif.notify({
        type:     'IMPORT_FAILED',
        title:    `นำเข้าข้อมูลล้มเหลว: ${type}`,
        message:  `ไม่มีข้อมูลที่นำเข้าได้ — มีข้อผิดพลาด ${result.errors.length} แถว`,
        severity: 'ERROR',
        tenantId: tenantId ?? null,
      });
    }

    return result;
  }

  // Imported stock goes into a branch (the importer's branch, else the tenant's default branch)
  // as BranchStock, and Product.stock mirrors it. Writing only Product.stock left imported
  // items "in stock" overall but at 0 in every branch, so the POS refused to sell them.
  private async resolveImportBranchId(tenantId?: string | null, branchId?: string | null): Promise<string | null> {
    if (branchId) return branchId;
    if (!tenantId) return null;
    const branch = await this.prisma.branch.findFirst({
      where:   { tenantId, isActive: true, status: 'ACTIVE' as any },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select:  { id: true },
    });
    return branch?.id ?? null;
  }

  /** Rows already in the shop are skipped; any other invalid row is an error. */
  private sortRow(r: PreviewResult['rows'][number], i: number, out: ImportResult): boolean {
    if (r.valid) return true;
    if (r.errors.every((e) => e.includes('มีอยู่แล้ว'))) out.skipped++;
    else out.errors.push({ row: i + 2, message: r.errors.join('; ') });
    return false;
  }

  private saveError(err: any): string {
    return err?.code === 'P2002' ? 'ข้อมูลซ้ำกับที่มีอยู่แล้ว' : 'บันทึกไม่สำเร็จ';
  }

  private async importProducts(preview: PreviewResult, tenantId?: string | null, branchId?: string | null): Promise<ImportResult> {
    const stockBranchId = await this.resolveImportBranchId(tenantId, branchId);
    const out: ImportResult = { imported: 0, skipped: 0, errors: [] };

    for (let i = 0; i < preview.rows.length; i++) {
      const r = preview.rows[i];
      if (!this.sortRow(r, i, out)) continue;
      const [name, sku, barcode, type, price, cost, stock, minStock] = r.data;
      const qty = stock ? Math.max(0, Math.floor(num(stock)) || 0) : 0;
      const min = minStock ? Math.max(0, Math.floor(num(minStock)) || 0) : 0;
      try {
        await this.prisma.$transaction(async (tx) => {
          const product = await tx.product.create({
            data: {
              name,
              sku,
              barcode:   barcode || null,
              type:      type.toUpperCase() as any,
              price:     num(price),
              costPrice: num(cost),
              stock:     qty,
              minStock:  min,
              ...this.tenantSvc.scope(tenantId),
            },
          });
          if (stockBranchId) {
            await tx.branchStock.create({
              data: { branchId: stockBranchId, productId: product.id, quantity: qty, minStock: min },
            });
            if (qty > 0) {
              await tx.stockMovement.create({
                data: { productId: product.id, type: 'IN', quantity: qty, branchId: stockBranchId, note: 'นำเข้าจากไฟล์' },
              });
            }
          }
        });
        out.imported++;
      } catch (err: any) {
        out.errors.push({ row: i + 2, message: this.saveError(err) });
      }
    }
    return out;
  }

  private async importCustomers(preview: PreviewResult, tenantId?: string | null): Promise<ImportResult> {
    const out: ImportResult = { imported: 0, skipped: 0, errors: [] };

    for (let i = 0; i < preview.rows.length; i++) {
      const r = preview.rows[i];
      if (!this.sortRow(r, i, out)) continue;
      const [name, phone, email, address, note] = r.data;
      try {
        await this.prisma.customer.create({
          data: {
            name,
            phone:   phone || null,
            email:   email || null,
            address: address || null,
            note:    note || null,
            tags:    [],
            ...this.tenantSvc.scope(tenantId),
          },
        });
        out.imported++;
      } catch (err: any) {
        out.errors.push({ row: i + 2, message: this.saveError(err) });
      }
    }
    return out;
  }

  // ── Categories ───────────────────────────────────────────────────────────────

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[฀-๿\s]+/g, (m) => m.trim() ? m.trim().replace(/\s+/g, '-') : '-')
      .replace(/[^a-z0-9฀-๿-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || `cat-${Date.now()}`;
  }

  private async previewCategories(headers: string[], dataRows: string[][], tenantId?: string | null): Promise<PreviewResult> {
    const existing = await this.prisma.category.findMany({
      where: this.tenantSvc.scope(tenantId),
      select: { slug: true, name: true },
    });
    const slugSet = new Set(existing.map((c) => c.slug.toLowerCase()));
    const nameSet = new Set(existing.map((c) => c.name.toLowerCase()));
    const nameRow = new Map<string, number>();
    const slugRow = new Map<string, number>();

    const rows = dataRows.map((row, i) => {
      const errors: string[] = [];
      const [name, slugRaw] = row;
      const slug = slugRaw || this.slugify(name);
      const nameKey = name.toLowerCase();
      const slugKey = slug.toLowerCase();

      if (!name) errors.push('ชื่อหมวดหมู่จำเป็น');
      if (name && nameSet.has(nameKey)) errors.push(`ชื่อ "${name}" มีอยู่แล้ว`);
      else if (name && nameRow.has(nameKey)) errors.push(`ชื่อ "${name}" ซ้ำกับแถวที่ ${nameRow.get(nameKey)} ในไฟล์`);
      if (slug && slugSet.has(slugKey)) errors.push(`slug "${slug}" มีอยู่แล้ว`);
      else if (slug && slugRow.has(slugKey)) errors.push(`slug "${slug}" ซ้ำกับแถวที่ ${slugRow.get(slugKey)} ในไฟล์`);

      if (name && !nameRow.has(nameKey)) nameRow.set(nameKey, i + 2);
      if (slug && !slugRow.has(slugKey)) slugRow.set(slugKey, i + 2);
      return { data: [name, slug], valid: errors.length === 0, errors };
    });
    return this.result(['ชื่อหมวดหมู่', 'slug'], rows);
  }

  private async importCategories(preview: PreviewResult, tenantId?: string | null): Promise<ImportResult> {
    const out: ImportResult = { imported: 0, skipped: 0, errors: [] };

    for (let i = 0; i < preview.rows.length; i++) {
      const r = preview.rows[i];
      if (!this.sortRow(r, i, out)) continue;
      const [name, slug] = r.data;
      try {
        await this.prisma.category.create({
          data: { name, slug, ...this.tenantSvc.scope(tenantId) },
        });
        out.imported++;
      } catch (err: any) {
        out.errors.push({ row: i + 2, message: this.saveError(err) });
      }
    }
    return out;
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────────

  private async previewSuppliers(headers: string[], dataRows: string[][], tenantId?: string | null): Promise<PreviewResult> {
    const existing = await this.prisma.supplier.findMany({
      where: this.tenantSvc.scope(tenantId),
      select: { name: true },
    });
    const nameSet = new Set(existing.map((s) => s.name.toLowerCase()));
    const nameRow = new Map<string, number>();

    const rows = dataRows.map((raw, i) => {
      const row = [...raw];
      row[1] = normalizePhone(row[1]);
      const errors: string[] = [];
      const [name, , , , , creditDaysRaw] = row;
      const key = name.toLowerCase();

      if (!name) errors.push('ชื่อจำเป็น');
      if (name && nameSet.has(key)) errors.push(`ชื่อ "${name}" มีอยู่แล้ว`);
      else if (name && nameRow.has(key)) errors.push(`ชื่อ "${name}" ซ้ำกับแถวที่ ${nameRow.get(key)} ในไฟล์`);
      if (creditDaysRaw && !(num(creditDaysRaw) >= 0)) errors.push('เครดิต (วัน) ต้องเป็นตัวเลข');

      if (name && !nameRow.has(key)) nameRow.set(key, i + 2);
      return { data: row, valid: errors.length === 0, errors };
    });
    return this.result(headers, rows);
  }

  private async importSuppliers(preview: PreviewResult, tenantId?: string | null): Promise<ImportResult> {
    const out: ImportResult = { imported: 0, skipped: 0, errors: [] };

    for (let i = 0; i < preview.rows.length; i++) {
      const r = preview.rows[i];
      if (!this.sortRow(r, i, out)) continue;
      const [name, phone, email, address, taxId, creditDays, note] = r.data;
      try {
        await this.prisma.supplier.create({
          data: {
            name,
            phone:      phone || null,
            email:      email || null,
            address:    address || null,
            taxId:      taxId || null,
            creditDays: creditDays ? Math.max(0, Math.floor(num(creditDays)) || 0) : 0,
            note:       note || null,
            ...this.tenantSvc.scope(tenantId),
          },
        });
        out.imported++;
      } catch (err: any) {
        out.errors.push({ row: i + 2, message: this.saveError(err) });
      }
    }
    return out;
  }
}

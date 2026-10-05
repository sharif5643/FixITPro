import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { OpsAccountingAdapter } from '../journal/ops-accounting.adapter';
import { AccountingService, ACCOUNTING_SOURCE } from '../accounting/accounting.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PackageSaleDto, PayPackageDebtDto } from './dto/package-sale.dto';
import { randomBytes } from 'crypto';
import { TopupDto } from './dto/topup.dto';

const DEDUCTION_RATE = 0.97;  // default: 97% deducted from carrier wallet, shop keeps 3%
const CARRIERS = ['AIS', 'TRUE', 'DTAC', 'NT'] as const;
const RECEIPT_RETRIES = 5;

type TenantId = string | null | undefined;

// Wallets, movements and package sales are scoped per tenant.
// Users without a tenant (legacy / SUPER_ADMIN) share the tenantId = NULL scope.
const scope = (tenantId: TenantId) => ({ tenantId: tenantId ?? null });

// Start/end of a Bangkok calendar day (YYYY-MM-DD) as UTC instants
function bangkokDayRange(date: string) {
  const start = new Date(`${date}T00:00:00+07:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(start.getTime())) {
    throw new BadRequestException(`Invalid date: ${date} (expected YYYY-MM-DD)`);
  }
  const end   = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function bangkokYmd(now = new Date()) {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
}

function isReceiptNumberConflict(err: unknown) {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = (err.meta as any)?.target;
  return Array.isArray(target) ? target.includes('receiptNumber') : String(target ?? '').includes('receiptNumber');
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Digits only, so "081-234-5678" and "0812345678" are the same customer. */
export function normalizePhone(raw?: string | null): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15 ? digits : null;
}

/** The partial unique index that allows one unpaid sale per phone number (see migration). */
function isOpenDebtConflict(err: unknown) {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = (err.meta as any)?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.includes('debtorPhone') || text.includes('one_open_debt');
}

interface PayLaterInput {
  packageAmount: number; paymentMethod: string; amountPaid: number; phoneNumber?: string;
  payLater?: boolean; debtorName?: string; debtorPhone?: string;
}

@Injectable()
export class CarrierWalletService {
  private readonly logger = new Logger(CarrierWalletService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private accounting?: AccountingService,
    @Optional() private opsAccounting?: OpsAccountingAdapter,
  ) {}

  /** The branch a SIM/package sale or top-up belongs to, from its shift. */
  private async branchOfShift(shiftId?: string | null): Promise<string | null> {
    if (!shiftId) return null;
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId }, select: { branchId: true } });
    return shift?.branchId ?? null;
  }

  /**
   * After a SIM/package sale commits: the money goes into the cash drawer ledger (cash into
   * the open drawer, other methods as unassigned records like every sale) and into the books.
   * Neither step can undo the sale.
   */
  private async afterPackageSale(
    sale: { id: string; receiptNumber: string; carrier: string; saleType: string; packageAmount: number; walletDeduction: number; profit: number; paymentMethod: string; creditAmount?: number },
    shiftId: string | null | undefined, userId: string, tenantId: TenantId,
  ) {
    try {
      const branchId = await this.branchOfShift(shiftId);
      // On credit, only what the customer paid now reaches the drawer
      const received = round2(sale.packageAmount - (sale.creditAmount ?? 0));
      if (branchId && this.accounting && received > 0) {
        await this.accounting.record({
          sourceType:    ACCOUNTING_SOURCE.PACKAGE_SALE,
          sourceId:      sale.id,
          paymentMethod: sale.paymentMethod as any,
          amount:        received,
          direction:     'IN',
          branchId,
          tenantId:      tenantId ?? null,
          actorUserId:   userId,
          note:          sale.receiptNumber,
        });
      }
      await this.opsAccounting?.recordPackageSale({ tenantId, branchId, sale, actorId: userId });
    } catch (err) {
      this.logger.warn(`PackageSale ${sale.receiptNumber}: drawer/journal posting failed: ${(err as Error).message}`);
    }
  }

  // ── Balances ─────────────────────────────────────────────────────────────────

  async getBalances(tenantId: TenantId) {
    const wallets = await this.prisma.carrierWallet.findMany({
      where: scope(tenantId),
    });
    // Wallets are created on first use — report missing ones as zero
    return CARRIERS.map((carrier) => ({
      carrier,
      balance: Number(wallets.find((w) => w.carrier === carrier)?.balance ?? 0),
    }));
  }

  // Wallets are created lazily, outside the caller's transaction: a unique-constraint
  // failure (concurrent create) would otherwise abort that whole transaction.
  private async ensureWallets(tenantId: TenantId, carriers: string[]) {
    for (const carrier of carriers) {
      if (!CARRIERS.includes(carrier as any)) {
        throw new BadRequestException(`Wallet for ${carrier} not found`);
      }
      const where = { ...scope(tenantId), carrier: carrier as any };
      if (await this.prisma.carrierWallet.findFirst({ where })) continue;
      try {
        await this.prisma.carrierWallet.create({ data: { ...where, balance: 0 } });
      } catch (err) {
        // Created concurrently by another request — fine
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
    }
  }

  private async getWallet(tx: any, tenantId: TenantId, carrier: string) {
    return tx.carrierWallet.findFirstOrThrow({ where: { ...scope(tenantId), carrier: carrier as any } });
  }

  // Receipt numbers are a per-day sequence; a concurrent sale can take the same
  // number, in which case the unique constraint fails and the whole transaction is retried.
  private async withReceiptRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt >= RECEIPT_RETRIES || !isReceiptNumberConflict(err)) throw err;
        this.logger.warn(`Receipt number conflict, retrying (attempt ${attempt})`);
      }
    }
  }

  // ── Pay later ("ค้างจ่าย") ─────────────────────────────────────────────────────

  /**
   * How a sale is paid. Paid in full: cash must cover the price (a short cash payment used
   * to be accepted and the drawer then expected money it never got). On credit: the
   * customer's phone is required, whatever is paid now is received and the rest is owed.
   */
  private payTerms(dto: PayLaterInput) {
    const price = dto.packageAmount;
    if (!dto.payLater) {
      if (dto.paymentMethod === 'CASH' && dto.amountPaid + 0.001 < price) {
        throw new BadRequestException('รับเงินสดไม่ครบ — ถ้าลูกค้าจะจ่ายทีหลัง ให้เลือก "ค้างจ่าย"');
      }
      return {
        credit: 0,
        change: dto.paymentMethod === 'CASH' ? round2(Math.max(0, dto.amountPaid - price)) : 0,
        debtor: null as null | { name: string | null; phone: string },
      };
    }
    const phone = normalizePhone(dto.debtorPhone ?? dto.phoneNumber);
    if (!phone) throw new BadRequestException('ค้างจ่ายต้องใส่เบอร์โทรลูกค้า (อย่างน้อย 9 หลัก)');
    const paidNow = round2(Math.min(Math.max(dto.amountPaid, 0), price));
    const credit  = round2(price - paidNow);
    if (credit <= 0) return { credit: 0, change: 0, debtor: null };   // paid in full after all
    return { credit, change: 0, debtor: { name: dto.debtorName?.trim() || null, phone } };
  }

  /** The unpaid sale this phone number still owes for, or null. */
  async openDebtFor(tenantId: TenantId, rawPhone?: string | null) {
    const phone = normalizePhone(rawPhone);
    if (!phone) return null;
    const sale = await this.prisma.packageSale.findFirst({
      where: { ...scope(tenantId), debtorPhone: phone, amountDue: { gt: 0 } },
      select: { id: true, receiptNumber: true, amountDue: true, packageAmount: true, debtorName: true, carrier: true, createdAt: true },
    });
    return sale ? { ...sale, amountDue: Number(sale.amountDue), packageAmount: Number(sale.packageAmount), phone } : null;
  }

  private async assertNoOpenDebt(tenantId: TenantId, phone: string) {
    const open = await this.openDebtFor(tenantId, phone);
    if (open) throw new BadRequestException(this.openDebtMessage(open));
  }

  private openDebtMessage(open?: { phone: string; amountDue: number; receiptNumber: string } | null) {
    return open
      ? `เบอร์ ${open.phone} ยังค้างจ่าย ${open.amountDue.toLocaleString('th-TH')} บาท (ใบเสร็จ ${open.receiptNumber}) — ต้องจ่ายยอดเดิมก่อนจึงจะค้างใหม่ได้`
      : 'ลูกค้าเบอร์นี้ยังมียอดค้างจ่ายอยู่ — ต้องจ่ายยอดเดิมก่อนจึงจะค้างใหม่ได้';
  }

  /** Runs a sale; a second credit sale for the same phone racing this one is refused clearly. */
  private async withOpenDebtGuard<T>(tenantId: TenantId, phone: string | null, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (phone && isOpenDebtConflict(err)) {
        throw new BadRequestException(this.openDebtMessage(await this.openDebtFor(tenantId, phone)));
      }
      throw err;
    }
  }

  private creditFields(terms: ReturnType<CarrierWalletService['payTerms']>) {
    return {
      creditAmount: terms.credit,
      amountDue:    terms.credit,
      debtorName:   terms.debtor?.name ?? null,
      debtorPhone:  terms.debtor?.phone ?? null,
    };
  }

  async listDebts(tenantId: TenantId, status: 'open' | 'settled' | 'all', q?: string) {
    const where: any = { ...scope(tenantId), creditAmount: { gt: 0 } };
    if (status === 'open') where.amountDue = { gt: 0 };
    if (status === 'settled') where.amountDue = 0;
    const term = q?.trim();
    if (term) {
      const digits = term.replace(/\D/g, '');
      where.OR = [
        { debtorName: { contains: term, mode: 'insensitive' } },
        { receiptNumber: { contains: term, mode: 'insensitive' } },
        ...(digits.length >= 3 ? [{ debtorPhone: { contains: digits } }] : []),
      ];
    }
    const rows = await this.prisma.packageSale.findMany({
      where,
      orderBy: { createdAt: status === 'open' ? 'asc' : 'desc' },
      take: 300,
      include: { debtPayments: { orderBy: { createdAt: 'asc' } } },
    });
    return rows.map((r) => ({
      id: r.id, receiptNumber: r.receiptNumber, carrier: r.carrier, saleType: r.saleType,
      phoneNumber: r.phoneNumber, debtorName: r.debtorName, debtorPhone: r.debtorPhone,
      packageAmount: Number(r.packageAmount), creditAmount: Number(r.creditAmount), amountDue: Number(r.amountDue),
      cashierName: r.cashierName, createdAt: r.createdAt, settledAt: r.settledAt,
      payments: r.debtPayments.map((p) => ({
        id: p.id, receiptNumber: p.receiptNumber, amount: Number(p.amount), paymentMethod: p.paymentMethod,
        cashierName: p.cashierName, createdAt: p.createdAt,
      })),
    }));
  }

  /** The customer pays all or part of what a credit sale still owes. */
  async payDebt(saleId: string, dto: PayPackageDebtDto, userId: string, tenantId: TenantId) {
    const amount = round2(dto.amount);
    const sale = await this.prisma.packageSale.findFirst({ where: { id: saleId, ...scope(tenantId) } });
    if (!sale || Number(sale.creditAmount) <= 0) throw new NotFoundException('ไม่พบรายการค้างจ่าย');
    if (Number(sale.amountDue) <= 0) throw new BadRequestException('รายการนี้จ่ายครบแล้ว');
    if (amount > Number(sale.amountDue) + 0.001) {
      throw new BadRequestException(`ยอดค้างเหลือ ${Number(sale.amountDue).toLocaleString('th-TH')} บาท — รับเกินยอดค้างไม่ได้`);
    }

    const done = await this.prisma.$transaction(async (tx) => {
      // Atomic: two cashiers taking the same debt at once cannot both succeed beyond what is owed
      const claimed = await tx.packageSale.updateMany({
        where: { id: sale.id, amountDue: { gte: amount } },
        data:  { amountDue: { decrement: amount } },
      });
      if (claimed.count === 0) throw new BadRequestException('ยอดค้างเปลี่ยนไปแล้ว กรุณารีเฟรชแล้วลองใหม่');
      const after = await tx.packageSale.findUniqueOrThrow({ where: { id: sale.id } });
      const settled = Number(after.amountDue) <= 0;
      if (settled) await tx.packageSale.update({ where: { id: sale.id }, data: { amountDue: 0, settledAt: new Date() } });
      const payment = await tx.packageSaleDebtPayment.create({
        data: {
          receiptNumber: `PD-${bangkokYmd()}-${randomBytes(3).toString('hex').toUpperCase()}`,
          amount,
          paymentMethod: dto.paymentMethod as any,
          shiftId:       dto.shiftId ?? null,
          cashierName:   dto.cashierName,
          createdById:   userId,
          packageSaleId: sale.id,
          ...scope(tenantId),
        },
      });
      return { payment, amountDue: settled ? 0 : Number(after.amountDue), settled };
    });

    // After commit: money into the drawer ledger and the books; never undoes the payment
    try {
      const branchId = await this.branchOfShift(dto.shiftId);
      if (branchId && this.accounting) {
        await this.accounting.record({
          sourceType:    ACCOUNTING_SOURCE.PACKAGE_DEBT_PAYMENT,
          sourceId:      done.payment.id,
          paymentMethod: dto.paymentMethod as any,
          amount,
          direction:     'IN',
          branchId,
          tenantId:      tenantId ?? null,
          actorUserId:   userId,
          note:          `${done.payment.receiptNumber} (${sale.receiptNumber})`,
        });
      }
      await this.opsAccounting?.recordPackageDebtPayment({
        tenantId, branchId, paymentId: done.payment.id, receiptNumber: done.payment.receiptNumber,
        saleReceipt: sale.receiptNumber, paymentMethod: dto.paymentMethod, amount, actorId: userId,
      });
    } catch (err) {
      this.logger.warn(`PackageDebtPayment ${done.payment.receiptNumber}: drawer/journal posting failed: ${(err as Error).message}`);
    }

    this.logger.log(`PackageDebtPayment sale=${sale.receiptNumber} amount=${amount} due=${done.amountDue}`);
    return {
      id: done.payment.id, receiptNumber: done.payment.receiptNumber, amount, paymentMethod: dto.paymentMethod,
      saleReceiptNumber: sale.receiptNumber, amountDue: done.amountDue, settled: done.settled,
      debtorName: sale.debtorName, debtorPhone: sale.debtorPhone, createdAt: done.payment.createdAt,
    };
  }

  // ── Package sale ──────────────────────────────────────────────────────────────

  async createPackageSale(dto: PackageSaleDto, userId: string, tenantId: TenantId) {
    if (dto.dealerCost != null && dto.dealerCost > dto.packageAmount) {
      throw new BadRequestException('ต้นทุนดีลเลอร์ต้องไม่เกินราคาขาย');
    }
    const walletDeduction = dto.dealerCost != null
      ? Math.round(dto.dealerCost * 100) / 100
      : Math.round(dto.packageAmount * DEDUCTION_RATE * 100) / 100;
    const profit          = Math.round((dto.packageAmount - walletDeduction) * 100) / 100;
    const saleType        = dto.saleType ?? 'PROMO';
    const terms           = this.payTerms(dto);
    const change          = terms.change;
    if (terms.debtor) await this.assertNoOpenDebt(tenantId, terms.debtor.phone);

    await this.ensureWallets(tenantId, [dto.carrier]);

    const done = await this.withOpenDebtGuard(tenantId, terms.debtor?.phone ?? null, () => this.withReceiptRetry(() => this.prisma.$transaction(async (tx) => {
      // Read wallet first to get id and a snapshot balance for error messages.
      const walletRow = await this.getWallet(tx, tenantId, dto.carrier);

      // P0-4 FIX: atomic conditional decrement — the WHERE clause is evaluated under
      // the row lock so two concurrent calls cannot both read the same balance and
      // both succeed when only one should.
      const result = await tx.carrierWallet.updateMany({
        where: {
          id:      walletRow.id,
          balance: { gte: walletDeduction },
        },
        data: { balance: { decrement: walletDeduction } },
      });

      if (result.count === 0) {
        throw new BadRequestException(
          `ยอดเงินในกระเป๋า${dto.carrier} ไม่เพียงพอ (มี ${Number(walletRow.balance).toFixed(2)} บาท ต้องการ ${walletDeduction.toFixed(2)} บาท)`,
        );
      }

      // Read committed balance for the movement record
      const updatedWallet = await tx.carrierWallet.findUniqueOrThrow({
        where: { id: walletRow.id },
      });
      const currentBalance = Number(walletRow.balance);
      const newBalance     = Number(updatedWallet.balance);

      // Record movement
      await tx.carrierWalletMovement.create({
        data: {
          carrier:       dto.carrier as any,
          type:          'DEDUCTION',
          amount:        walletDeduction,
          balanceBefore: currentBalance,
          balanceAfter:  newBalance,
          note:          dto.phoneNumber ? `เบอร์: ${dto.phoneNumber}` : undefined,
          walletId:      walletRow.id,
          shiftId:       dto.shiftId ?? null,
          createdById:   userId,
          ...scope(tenantId),
        },
      });

      // Create PackageSale record
      const receiptNumber = await this.generateReceiptNumber(tx);
      const sale = await tx.packageSale.create({
        data: {
          receiptNumber,
          carrier:         dto.carrier as any,
          saleType,
          packageAmount:   dto.packageAmount,
          walletDeduction,
          profit,
          phoneNumber:     dto.phoneNumber ?? null,
          note:            dto.note ?? null,
          paymentMethod:   dto.paymentMethod as any,
          amountPaid:      dto.amountPaid,
          change,
          cashierName:     dto.cashierName,
          shiftId:         dto.shiftId ?? null,
          createdById:     userId,
          ...this.creditFields(terms),
          ...scope(tenantId),
        },
      });

      this.logger.log(
        `PackageSale carrier=${dto.carrier} amount=${dto.packageAmount} deduction=${walletDeduction} receipt=${receiptNumber}`,
      );

      return {
        ...sale,
        packageAmount:   Number(sale.packageAmount),
        walletDeduction: Number(sale.walletDeduction),
        profit:          Number(sale.profit),
        amountPaid:      Number(sale.amountPaid),
        change:          Number(sale.change),
        creditAmount:    Number(sale.creditAmount),
        amountDue:       Number(sale.amountDue),
        walletBalance:   newBalance,
      };
    })));
    await this.afterPackageSale(done as any, dto.shiftId, userId, tenantId);
    return done;
  }

  // ── Top-up ────────────────────────────────────────────────────────────────────

  async topup(dto: TopupDto, userId: string, tenantId: TenantId) {
    await this.ensureWallets(tenantId, [dto.carrier]);

    const done = await this.prisma.$transaction(async (tx) => {
      const wallet = await this.getWallet(tx, tenantId, dto.carrier);

      // Atomic increment so a concurrent sale's decrement is not overwritten
      const updated = await tx.carrierWallet.update({
        where: { id: wallet.id },
        data:  { balance: { increment: dto.amount } },
      });
      const newBalance     = Number(updated.balance);
      const currentBalance = Math.round((newBalance - dto.amount) * 100) / 100;

      const movement = await tx.carrierWalletMovement.create({
        data: {
          carrier:       dto.carrier as any,
          type:          'TOPUP',
          amount:        dto.amount,
          balanceBefore: currentBalance,
          balanceAfter:  newBalance,
          note:          dto.note ?? null,
          walletId:      wallet.id,
          shiftId:       dto.shiftId ?? null,
          createdById:   userId,
          ...scope(tenantId),
        },
      });

      this.logger.log(
        `Topup carrier=${dto.carrier} amount=${dto.amount} newBalance=${newBalance}`,
      );

      return { carrier: dto.carrier, balance: newBalance, movementId: movement.id };
    });
    await this.opsAccounting?.recordWalletTopup({
      tenantId, branchId: await this.branchOfShift(dto.shiftId).catch(() => null),
      movementId: done.movementId, carrier: dto.carrier, amount: dto.amount, actorId: userId,
    });
    return { carrier: done.carrier, balance: done.balance };
  }

  // ── SIM card sale (no carrier wallet deduction) ───────────────────────────────

  async createSimSale(
    dto: {
      carrier: string;
      packageAmount: number; // selling price
      costPrice: number;     // what shop paid (walletDeduction field)
      paymentMethod: string;
      amountPaid: number;
      phoneNumber?: string;
      note?: string;
      shiftId?: string;
      cashierName: string;
      payLater?: boolean;
      debtorName?: string;
      debtorPhone?: string;
    },
    userId: string,
    tenantId: TenantId,
  ) {
    const profit = Math.round((dto.packageAmount - dto.costPrice) * 100) / 100;
    const terms  = this.payTerms(dto);
    const change = terms.change;
    if (terms.debtor) await this.assertNoOpenDebt(tenantId, terms.debtor.phone);

    const done = await this.withOpenDebtGuard(tenantId, terms.debtor?.phone ?? null, () => this.withReceiptRetry(() => this.prisma.$transaction(async (tx) => {
      const receiptNumber = await this.generateReceiptNumber(tx);
      const sale = await tx.packageSale.create({
        data: {
          receiptNumber,
          carrier:         dto.carrier as any,
          saleType:        'SIM_SALE' as any,
          packageAmount:   dto.packageAmount,
          walletDeduction: dto.costPrice,
          profit,
          phoneNumber:     dto.phoneNumber ?? null,
          note:            dto.note ?? null,
          paymentMethod:   dto.paymentMethod as any,
          amountPaid:      dto.amountPaid,
          change,
          cashierName:     dto.cashierName,
          shiftId:         dto.shiftId ?? null,
          createdById:     userId,
          ...this.creditFields(terms),
          ...scope(tenantId),
        },
      });

      this.logger.log(
        `SimSale carrier=${dto.carrier} sellPrice=${dto.packageAmount} cost=${dto.costPrice} profit=${profit} receipt=${receiptNumber}`,
      );

      return {
        ...sale,
        packageAmount:   Number(sale.packageAmount),
        walletDeduction: Number(sale.walletDeduction),
        profit:          Number(sale.profit),
        amountPaid:      Number(sale.amountPaid),
        change:          Number(sale.change),
        creditAmount:    Number(sale.creditAmount),
        amountDue:       Number(sale.amountDue),
      };
    })));
    await this.afterPackageSale(done as any, dto.shiftId, userId, tenantId);
    return done;
  }

  // ── Package sales listing with filter ─────────────────────────────────────────

  // startDate / endDate are inclusive Bangkok calendar days (YYYY-MM-DD)
  async listPackageSales(opts: {
    startDate?: string;
    endDate?: string;
    carrier?: string;
    saleType?: string;
    take?: number;
    tenantId: TenantId;
  }) {
    const where: any = scope(opts.tenantId);
    if (opts.carrier) where.carrier = opts.carrier;
    if (opts.saleType) where.saleType = opts.saleType;
    if (opts.startDate || opts.endDate) {
      where.createdAt = {};
      if (opts.startDate) where.createdAt.gte = bangkokDayRange(opts.startDate).start;
      if (opts.endDate)   where.createdAt.lt  = bangkokDayRange(opts.endDate).end;
    }

    const rows = await this.prisma.packageSale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts.take ?? 200,
      include: { createdBy: { select: { name: true } } },
    });

    return rows.map((r) => ({
      ...r,
      packageAmount:   Number(r.packageAmount),
      walletDeduction: Number(r.walletDeduction),
      profit:          Number(r.profit),
      amountPaid:      Number(r.amountPaid),
      change:          Number(r.change),
      creditAmount:    Number(r.creditAmount),
      amountDue:       Number(r.amountDue),
    }));
  }

  // ── Shift-close reconciliation ───────────────────────────────────────────────

  async reconcileAtClose(
    entries: { carrier: string; actualBalance: number; note?: string }[],
    shiftId: string | null,
    userId: string,
    tenantId: TenantId,
  ) {
    await this.ensureWallets(tenantId, entries.map((e) => e.carrier));

    return this.prisma.$transaction(async (tx) => {
      const results: {
        carrier: string;
        balanceBefore: number;
        balanceAfter: number;
        difference: number;
      }[] = [];

      for (const entry of entries) {
        const wallet = await this.getWallet(tx, tenantId, entry.carrier);

        const currentBalance = Number(wallet.balance);
        const newBalance     = Math.round(entry.actualBalance * 100) / 100;
        const difference     = Math.round((newBalance - currentBalance) * 100) / 100;

        if (Math.abs(difference) < 0.01) {
          results.push({ carrier: entry.carrier, balanceBefore: currentBalance, balanceAfter: currentBalance, difference: 0 });
          continue;
        }

        await tx.carrierWallet.update({
          where: { id: wallet.id },
          data:  { balance: newBalance },
        });

        const noteText = entry.note
          ? `ตรวจสอบปิดกะ: ${entry.note}`
          : `ตรวจสอบปิดกะ (ระบบ ${currentBalance.toFixed(2)} → จริง ${newBalance.toFixed(2)})`;

        await tx.carrierWalletMovement.create({
          data: {
            carrier:       entry.carrier as any,
            type:          'ADJUSTMENT',
            amount:        Math.abs(difference),
            balanceBefore: currentBalance,
            balanceAfter:  newBalance,
            note:          noteText,
            walletId:      wallet.id,
            shiftId:       shiftId ?? null,
            createdById:   userId,
            ...scope(tenantId),
          },
        });

        this.logger.log(
          `Reconcile carrier=${entry.carrier} before=${currentBalance} after=${newBalance} diff=${difference}`,
        );

        results.push({ carrier: entry.carrier, balanceBefore: currentBalance, balanceAfter: newBalance, difference });
      }

      return results;
    });
  }

  // ── Owner balance correction (e.g. clearing test top-ups) ────────────────────

  // Sets a wallet to an exact balance. History is kept: the change is recorded as an
  // ADJUSTMENT movement with the owner's reason, so it stays auditable.
  async adjustBalance(
    dto: { carrier: string; newBalance: number; reason: string },
    userId: string,
    tenantId: TenantId,
  ) {
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('กรุณาระบุเหตุผลการปรับยอด');

    await this.ensureWallets(tenantId, [dto.carrier]);

    return this.prisma.$transaction(async (tx) => {
      const wallet         = await this.getWallet(tx, tenantId, dto.carrier);
      const currentBalance = Number(wallet.balance);
      const newBalance     = Math.round(dto.newBalance * 100) / 100;
      const difference     = Math.round((newBalance - currentBalance) * 100) / 100;

      if (Math.abs(difference) < 0.01) {
        return { carrier: dto.carrier, balanceBefore: currentBalance, balance: currentBalance, difference: 0 };
      }

      await tx.carrierWallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
      await tx.carrierWalletMovement.create({
        data: {
          carrier:       dto.carrier as any,
          type:          'ADJUSTMENT',
          amount:        Math.abs(difference),
          balanceBefore: currentBalance,
          balanceAfter:  newBalance,
          note:          `เจ้าของร้านปรับยอด: ${reason}`,
          walletId:      wallet.id,
          createdById:   userId,
          ...scope(tenantId),
        },
      });

      this.logger.log(`Adjust carrier=${dto.carrier} before=${currentBalance} after=${newBalance} by=${userId}`);
      return { carrier: dto.carrier, balanceBefore: currentBalance, balance: newBalance, difference };
    });
  }

  // ── Opening balance (called by ShiftsService on openShift) ───────────────────

  async recordOpeningBalances(
    shiftId: string,
    userId: string,
    balances: Partial<Record<'AIS' | 'TRUE' | 'DTAC' | 'NT', number>>,
    tenantId: TenantId,
  ) {
    const carriers = Object.entries(balances)
      .filter(([, balance]) => balance !== undefined && balance !== null)
      .map(([carrier]) => carrier);
    await this.ensureWallets(tenantId, carriers);

    await this.prisma.$transaction(async (tx) => {
      for (const [carrier, balance] of Object.entries(balances)) {
        if (balance === undefined || balance === null) continue;

        const wallet = await this.getWallet(tx, tenantId, carrier);

        const currentBalance = Number(wallet.balance);
        const newBalance     = Math.round(Number(balance) * 100) / 100;

        await tx.carrierWallet.update({
          where: { id: wallet.id },
          data:  { balance: newBalance },
        });

        await tx.carrierWalletMovement.create({
          data: {
            carrier:       carrier as any,
            type:          'OPENING',
            amount:        newBalance,
            balanceBefore: currentBalance,
            balanceAfter:  newBalance,
            note:          `เปิดกะ`,
            walletId:      wallet.id,
            shiftId,
            createdById:   userId,
            ...scope(tenantId),
          },
        });
      }
    });
  }

  // ── Per-carrier summary of one shift (used by ShiftsService) ─────────────────

  async getShiftCarrierSummary(shiftId: string) {
    const [sales, topups] = await Promise.all([
      this.prisma.packageSale.groupBy({
        by:     ['carrier'],
        where:  { shiftId },
        _count: { _all: true },
        _sum:   { packageAmount: true, walletDeduction: true, profit: true },
      }),
      this.prisma.carrierWalletMovement.groupBy({
        by:     ['carrier'],
        where:  { shiftId, type: 'TOPUP' },
        _count: { _all: true },
        _sum:   { amount: true },
      }),
    ]);

    return CARRIERS.map((carrier) => {
      const s = sales.find((r) => r.carrier === carrier);
      const t = topups.find((r) => r.carrier === carrier);
      return {
        carrier,
        salesCount:      s?._count._all ?? 0,
        salesAmount:     Number(s?._sum.packageAmount ?? 0),
        walletDeduction: Number(s?._sum.walletDeduction ?? 0),
        profit:          Number(s?._sum.profit ?? 0),
        topupCount:      t?._count._all ?? 0,
        topupAmount:     Number(t?._sum.amount ?? 0),
      };
    });
  }

  // ── Movement history ──────────────────────────────────────────────────────────

  async getMovements(tenantId: TenantId, carrier?: string, date?: string) {
    const where: any = scope(tenantId);
    if (carrier) where.carrier = carrier;
    if (date) {
      const { start, end } = bangkokDayRange(date);
      where.createdAt = { gte: start, lt: end };
    }
    const rows = await this.prisma.carrierWalletMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      ...r,
      amount:        Number(r.amount),
      balanceBefore: Number(r.balanceBefore),
      balanceAfter:  Number(r.balanceAfter),
    }));
  }

  // ── Package sales log ─────────────────────────────────────────────────────────

  async getPackageSales(tenantId: TenantId, date?: string, carrier?: string) {
    const where: any = scope(tenantId);
    if (carrier) where.carrier = carrier;
    if (date) {
      const { start, end } = bangkokDayRange(date);
      where.createdAt = { gte: start, lt: end };
    }
    const rows = await this.prisma.packageSale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((r) => ({
      ...r,
      packageAmount:   Number(r.packageAmount),
      walletDeduction: Number(r.walletDeduction),
      profit:          Number(r.profit),
      amountPaid:      Number(r.amountPaid),
      change:          Number(r.change),
    }));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  // PKG-YYYYMMDD-#### (Bangkok date), next number after the highest one issued today.
  // Uses max rather than count so deleted rows cannot cause a permanent collision.
  private async generateReceiptNumber(tx: any): Promise<string> {
    const prefix = `PKG-${bangkokYmd()}-`;
    const last   = await tx.packageSale.findFirst({
      where:   { receiptNumber: { startsWith: prefix } },
      orderBy: { receiptNumber: 'desc' },
      select:  { receiptNumber: true },
    });
    const lastSeq = last ? parseInt(last.receiptNumber.slice(prefix.length), 10) || 0 : 0;
    return `${prefix}${String(lastSeq + 1).padStart(4, '0')}`;
  }
}

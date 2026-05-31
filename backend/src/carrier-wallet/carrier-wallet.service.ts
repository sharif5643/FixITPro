import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PackageSaleDto } from './dto/package-sale.dto';
import { TopupDto } from './dto/topup.dto';

const PROFIT_RATE    = 0.03;  // shop keeps 3%
const DEDUCTION_RATE = 0.97;  // 97% deducted from carrier wallet

@Injectable()
export class CarrierWalletService {
  private readonly logger = new Logger(CarrierWalletService.name);

  constructor(private prisma: PrismaService) {}

  // ── Balances ─────────────────────────────────────────────────────────────────

  async getBalances() {
    const wallets = await this.prisma.carrierWallet.findMany({
      orderBy: { carrier: 'asc' },
    });
    return wallets.map((w) => ({
      carrier: w.carrier,
      balance: Number(w.balance),
    }));
  }

  // ── Package sale ──────────────────────────────────────────────────────────────

  async createPackageSale(dto: PackageSaleDto, userId: string) {
    const walletDeduction = Math.round(dto.packageAmount * DEDUCTION_RATE * 100) / 100;
    const profit          = Math.round(dto.packageAmount * PROFIT_RATE * 100) / 100;
    const change          = dto.paymentMethod === 'CASH'
      ? Math.max(0, dto.amountPaid - dto.packageAmount)
      : 0;

    return this.prisma.$transaction(async (tx) => {
      // Lock and fetch wallet row
      const wallet = await tx.carrierWallet.findUnique({
        where: { carrier: dto.carrier as any },
      });

      if (!wallet) {
        throw new BadRequestException(`Wallet for ${dto.carrier} not found`);
      }

      const currentBalance = Number(wallet.balance);
      if (currentBalance < walletDeduction) {
        throw new BadRequestException(
          `ยอดเงินในกระเป๋า${dto.carrier} ไม่เพียงพอ (มี ${currentBalance.toFixed(2)} บาท ต้องการ ${walletDeduction.toFixed(2)} บาท)`,
        );
      }

      const newBalance = Math.round((currentBalance - walletDeduction) * 100) / 100;

      // Deduct wallet
      await tx.carrierWallet.update({
        where: { carrier: dto.carrier as any },
        data:  { balance: newBalance },
      });

      // Record movement
      await tx.carrierWalletMovement.create({
        data: {
          carrier:       dto.carrier as any,
          type:          'DEDUCTION',
          amount:        walletDeduction,
          balanceBefore: currentBalance,
          balanceAfter:  newBalance,
          note:          dto.phoneNumber ? `เบอร์: ${dto.phoneNumber}` : undefined,
          walletId:      wallet.id,
          shiftId:       dto.shiftId ?? null,
          createdById:   userId,
        },
      });

      // Create PackageSale record
      const receiptNumber = await this.generateReceiptNumber(tx);
      const sale = await tx.packageSale.create({
        data: {
          receiptNumber,
          carrier:         dto.carrier as any,
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
        walletBalance:   newBalance,
      };
    });
  }

  // ── Top-up ────────────────────────────────────────────────────────────────────

  async topup(dto: TopupDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.carrierWallet.findUnique({
        where: { carrier: dto.carrier as any },
      });

      if (!wallet) {
        throw new BadRequestException(`Wallet for ${dto.carrier} not found`);
      }

      const currentBalance = Number(wallet.balance);
      const newBalance     = Math.round((currentBalance + dto.amount) * 100) / 100;

      await tx.carrierWallet.update({
        where: { carrier: dto.carrier as any },
        data:  { balance: newBalance },
      });

      await tx.carrierWalletMovement.create({
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
        },
      });

      this.logger.log(
        `Topup carrier=${dto.carrier} amount=${dto.amount} newBalance=${newBalance}`,
      );

      return { carrier: dto.carrier, balance: newBalance };
    });
  }

  // ── Opening balance (called by ShiftsService on openShift) ───────────────────

  async recordOpeningBalances(
    shiftId: string,
    userId: string,
    balances: Partial<Record<'AIS' | 'TRUE' | 'DTAC' | 'NT', number>>,
  ) {
    for (const [carrier, balance] of Object.entries(balances)) {
      if (balance === undefined || balance === null) continue;

      const wallet = await this.prisma.carrierWallet.findUnique({
        where: { carrier: carrier as any },
      });
      if (!wallet) continue;

      const currentBalance = Number(wallet.balance);
      const newBalance     = Math.round(Number(balance) * 100) / 100;

      await this.prisma.carrierWallet.update({
        where: { carrier: carrier as any },
        data:  { balance: newBalance },
      });

      await this.prisma.carrierWalletMovement.create({
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
        },
      });
    }
  }

  // ── Movement history ──────────────────────────────────────────────────────────

  async getMovements(carrier?: string, date?: string) {
    const where: any = {};
    if (carrier) where.carrier = carrier;
    if (date) {
      const start = new Date(date);
      const end   = new Date(date);
      end.setDate(end.getDate() + 1);
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

  async getPackageSales(date?: string, carrier?: string) {
    const where: any = {};
    if (carrier) where.carrier = carrier;
    if (date) {
      const start = new Date(date);
      const end   = new Date(date);
      end.setDate(end.getDate() + 1);
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

  private async generateReceiptNumber(tx: any): Promise<string> {
    const now    = new Date();
    const ymd    = now.toISOString().slice(0, 10).replace(/-/g, '');
    const count  = await tx.packageSale.count({
      where: { receiptNumber: { startsWith: `PKG-${ymd}` } },
    });
    const seq    = String(count + 1).padStart(4, '0');
    return `PKG-${ymd}-${seq}`;
  }
}

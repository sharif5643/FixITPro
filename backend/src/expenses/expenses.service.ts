import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AccountingService, ACCOUNTING_SOURCE } from '../accounting/accounting.service';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { VoidExpenseDto } from './dto/void-expense.dto';

const ALLOWED_ROLES = ['OWNER', 'MANAGER'];

const DEFAULT_CATEGORIES = [
  { code: 'rent',        name: 'ค่าเช่า' },
  { code: 'utilities',   name: 'ค่าไฟ / น้ำ / อินเทอร์เน็ต' },
  { code: 'salary',      name: 'เงินเดือน / ค่าแรง' },
  { code: 'marketing',   name: 'ค่าการตลาด / โฆษณา' },
  { code: 'supplies',    name: 'อุปกรณ์สำนักงาน' },
  { code: 'maintenance', name: 'ค่าซ่อมบำรุง' },
  { code: 'shipping',    name: 'ค่าขนส่ง / ค่าส่งของ' },
  { code: 'misc',        name: 'ค่าใช้จ่ายอื่นๆ' },
];

@Injectable()
export class ExpensesService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private accounting: AccountingService,
  ) {}

  async onModuleInit() {
    await this.seedDefaultCategories();
    await this.ensurePermissions();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private thaiDateBounds(date: string) {
    const start = new Date(`${date}T00:00:00+07:00`);
    const end   = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }

  private requireRole(role: string) {
    if (!ALLOWED_ROLES.includes(role)) {
      throw new ForbiddenException('ต้องการสิทธิ์เจ้าของร้านหรือผู้จัดการ');
    }
  }

  private async seedDefaultCategories() {
    const count = await this.prisma.expenseCategory.count();
    if (count > 0) return;
    await this.prisma.expenseCategory.createMany({ data: DEFAULT_CATEGORIES });
  }

  private async ensurePermissions() {
    const roles: Array<'OWNER' | 'MANAGER'> = ['OWNER', 'MANAGER'];
    await this.prisma.rolePermission.createMany({
      data: roles.map((role) => ({ role, permission: 'expenses.manage' })),
      skipDuplicates: true,
    });
  }

  // ── Categories ───────────────────────────────────────────────────────────────

  findAllCategories(tenantId?: string | null) {
    // Return global categories (null tenantId) AND this tenant's private categories
    return this.prisma.expenseCategory.findMany({
      where: {
        OR: [
          { tenantId: null },
          ...(tenantId ? [{ tenantId }] : []),
        ],
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { expenses: true } } },
    });
  }

  async createCategory(dto: CreateExpenseCategoryDto, role: string, tenantId?: string | null) {
    this.requireRole(role);
    return this.prisma.expenseCategory.create({
      data: { ...dto, tenantId: tenantId ?? null },
    });
  }

  async updateCategory(id: string, dto: UpdateExpenseCategoryDto, role: string, tenantId?: string | null) {
    this.requireRole(role);
    const cat = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('ไม่พบหมวดหมู่');
    // Prevent editing a category that belongs to another tenant
    if (cat.tenantId !== null && tenantId && cat.tenantId !== tenantId) {
      throw new NotFoundException('ไม่พบหมวดหมู่');
    }
    return this.prisma.expenseCategory.update({ where: { id }, data: dto });
  }

  // ── Expenses ─────────────────────────────────────────────────────────────────

  async create(dto: CreateExpenseDto, userId: string, role: string, branchId?: string) {
    this.requireRole(role);
    const cat = await this.prisma.expenseCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!cat || !cat.isActive) {
      throw new BadRequestException('หมวดหมู่ไม่ถูกต้องหรือถูกปิดใช้งาน');
    }
    // Auto-attach to creator's active shift so cash expenses reduce expected drawer balance
    const activeShift = await this.prisma.shift.findFirst({
      where: { userId, isActive: true },
      select: { id: true },
    });
    const { start } = this.thaiDateBounds(dto.expenseDate);

    const expense = await this.prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          expenseDate:   start,
          amount:        dto.amount,
          description:   dto.description,
          paymentMethod: dto.paymentMethod,
          referenceNo:   dto.referenceNo,
          note:          dto.note,
          categoryId:    dto.categoryId,
          createdById:   userId,
          shiftId:       activeShift?.id ?? null,
          branchId:      branchId ?? null,
        },
        include: {
          category:  { select: { id: true, name: true, code: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });

      // Record CASH expense in Cash Drawer ledger (OUT — cash leaves drawer)
      if (branchId) {
        const branchInfo = await tx.branch.findUnique({
          where:  { id: branchId },
          select: { tenantId: true },
        });
        await this.accounting.record({
          sourceType:    ACCOUNTING_SOURCE.EXPENSE_PAYMENT,
          sourceId:      created.id,
          paymentMethod: dto.paymentMethod as any,
          amount:        dto.amount,
          direction:     'OUT',
          branchId,
          tenantId:      branchInfo?.tenantId ?? null,
          actorUserId:   userId,
          note:          dto.description,
        }, tx);
      }

      return created;
    });

    await this.auditLog.log({
      actorId: userId,
      action: 'EXPENSE_CREATED',
      entityType: 'Expense',
      entityId: expense.id,
      afterData: {
        amount: Number(dto.amount),
        description: dto.description,
        paymentMethod: dto.paymentMethod,
        categoryId: dto.categoryId,
      },
    });
    return expense;
  }

  async findAll(query: {
    startDate?:  string;
    endDate?:    string;
    categoryId?: string;
    showVoided?: string;
    page?:       string;
    limit?:      string;
    branchId?:   string;
  }, tenantId?: string | null) {
    const page  = Math.max(1, parseInt(query.page  ?? '1'));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '50')));
    const skip  = (page - 1) * limit;

    const where: Record<string, any> = {};

    if (query.startDate) {
      where.expenseDate = { gte: new Date(`${query.startDate}T00:00:00+07:00`) };
    }
    if (query.endDate) {
      where.expenseDate = {
        ...where.expenseDate,
        lt: new Date(
          new Date(`${query.endDate}T00:00:00+07:00`).getTime() + 24 * 60 * 60 * 1000,
        ),
      };
    }
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.showVoided !== 'true') {
      where.voidedAt = null;
    }
    if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (tenantId) {
      where.branch = { tenantId };
    }

    const [items, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          category:  { select: { id: true, name: true, code: true } },
          createdBy: { select: { id: true, name: true } },
          voidedBy:  { select: { id: true, name: true } },
        },
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string, branchId?: string | null, isElevated: boolean = true, tenantId?: string | null) {
    const where: any = { id };
    if (tenantId) where.branch = { tenantId };
    const expense = await this.prisma.expense.findFirst({
      where,
      include: {
        category:  { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
        voidedBy:  { select: { id: true, name: true } },
      },
    });
    if (!expense) throw new NotFoundException('ไม่พบรายการค่าใช้จ่าย');
    if (!isElevated && branchId !== undefined && expense.branchId !== branchId) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงรายการนี้');
    }
    return expense;
  }

  async voidExpense(id: string, dto: VoidExpenseDto, userId: string, role: string, tenantId?: string | null) {
    this.requireRole(role);
    const where: any = { id };
    if (tenantId) where.branch = { tenantId };
    const expense = await this.prisma.expense.findFirst({ where });
    if (!expense) throw new NotFoundException('ไม่พบรายการค่าใช้จ่าย');
    if (expense.voidedAt) throw new BadRequestException('รายการนี้ถูกยกเลิกแล้ว');
    const voided = await this.prisma.expense.update({
      where: { id },
      data: {
        voidedAt:   new Date(),
        voidReason: dto.voidReason,
        voidedById: userId,
      },
      include: {
        category:  { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
        voidedBy:  { select: { id: true, name: true } },
      },
    });
    await this.auditLog.log({
      actorId: userId,
      action: 'EXPENSE_VOIDED',
      entityType: 'Expense',
      entityId: id,
      afterData: { voidReason: dto.voidReason },
    });
    return voided;
  }

  // ── Summaries ─────────────────────────────────────────────────────────────────

  async getDailySummary(date: string, tenantId?: string | null) {
    const { start, end } = this.thaiDateBounds(date);
    const tenantFilter = tenantId ? { branch: { tenantId } } : {};
    const expenses = await this.prisma.expense.findMany({
      where: { expenseDate: { gte: start, lt: end }, voidedAt: null, ...tenantFilter },
      include: { category: { select: { id: true, name: true, code: true } } },
    });
    const totalAmount = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const byCategoryMap: Record<string, { categoryId: string; categoryName: string; total: number; count: number }> = {};
    for (const e of expenses) {
      if (!byCategoryMap[e.categoryId]) {
        byCategoryMap[e.categoryId] = {
          categoryId:   e.categoryId,
          categoryName: e.category.name,
          total:        0,
          count:        0,
        };
      }
      byCategoryMap[e.categoryId].total += Number(e.amount);
      byCategoryMap[e.categoryId].count++;
    }
    const byCategory = Object.values(byCategoryMap).sort((a, b) => b.total - a.total);
    return { date, totalAmount, byCategory, count: expenses.length };
  }

  async getMonthlySummary(year: number, month: number, tenantId?: string | null) {
    const pad  = (n: number) => String(n).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    const start   = new Date(`${year}-${pad(month)}-01T00:00:00+07:00`);
    const end     = new Date(
      new Date(`${year}-${pad(month)}-${lastDay}T00:00:00+07:00`).getTime() + 24 * 60 * 60 * 1000,
    );
    const tenantFilter = tenantId ? { branch: { tenantId } } : {};

    const expenses = await this.prisma.expense.findMany({
      where: { expenseDate: { gte: start, lt: end }, voidedAt: null, ...tenantFilter },
      include: { category: { select: { id: true, name: true, code: true } } },
      orderBy: { expenseDate: 'asc' },
    });

    const totalAmount = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    const byCategoryMap: Record<string, { categoryId: string; categoryName: string; total: number; count: number }> = {};
    const byDayMap: Record<string, number> = {};

    for (const e of expenses) {
      // category breakdown
      if (!byCategoryMap[e.categoryId]) {
        byCategoryMap[e.categoryId] = {
          categoryId:   e.categoryId,
          categoryName: e.category.name,
          total:        0,
          count:        0,
        };
      }
      byCategoryMap[e.categoryId].total += Number(e.amount);
      byCategoryMap[e.categoryId].count++;

      // daily breakdown (convert UTC back to Thai date for display)
      const thaiDate = new Date(e.expenseDate.getTime() + 7 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      byDayMap[thaiDate] = (byDayMap[thaiDate] ?? 0) + Number(e.amount);
    }

    return {
      year,
      month,
      totalAmount,
      count: expenses.length,
      byCategory: Object.values(byCategoryMap).sort((a, b) => b.total - a.total),
      byDay: Object.entries(byDayMap)
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }
}

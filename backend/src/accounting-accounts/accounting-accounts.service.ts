import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  CHART_OF_ACCOUNTS_TEMPLATE,
  COA_TEMPLATE_COUNT,
} from './constants/chart-of-accounts';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

export interface InitResult {
  tenantId:  string;
  created:   number;
  skipped:   number;
  total:     number;
}

export interface DryRunResult {
  tenantId:       string;
  tenantName:     string;
  existingCount:  number;
  missingCount:   number;
  wouldCreate:    number;
  existing:       { code: string; name: string; nameTh: string; isActive: boolean }[];
  missing:        { code: string; name: string; nameTh: string }[];
}

@Injectable()
export class AccountingAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Initialize Chart of Accounts for a tenant (idempotent) ────────────────
  async initializeForTenant(tenantId: string): Promise<InitResult> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);

    const existing = await this.prisma.accountingAccount.findMany({
      where:  { tenantId },
      select: { code: true },
    });
    const existingCodes = new Set(existing.map(a => a.code));

    const toCreate = CHART_OF_ACCOUNTS_TEMPLATE.filter(t => !existingCodes.has(t.code));

    if (toCreate.length === 0) {
      return { tenantId, created: 0, skipped: existing.length, total: COA_TEMPLATE_COUNT };
    }

    // createMany with skipDuplicates handles race conditions atomically
    const result = await this.prisma.accountingAccount.createMany({
      data: toCreate.map(t => ({
        code:      t.code,
        name:      t.name,
        nameTh:    t.nameTh,
        type:      t.type,
        subType:   t.subType ?? null,
        sortOrder: t.sortOrder,
        tenantId,
        isSystem:  true,
        isActive:  true,
      })),
      skipDuplicates: true,
    });

    const skipped = COA_TEMPLATE_COUNT - result.count;

    return { tenantId, created: result.count, skipped, total: COA_TEMPLATE_COUNT };
  }

  // ── Dry run — report what would be created without writing ────────────────
  async dryRunForTenant(tenantId: string): Promise<DryRunResult> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);

    const existing = await this.prisma.accountingAccount.findMany({
      where:  { tenantId },
      select: { code: true, name: true, nameTh: true, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const existingCodes = new Set(existing.map(a => a.code));
    const missing = CHART_OF_ACCOUNTS_TEMPLATE.filter(t => !existingCodes.has(t.code));

    return {
      tenantId,
      tenantName:    tenant.shopName,
      existingCount: existing.length,
      missingCount:  missing.length,
      wouldCreate:   missing.length,
      existing:      existing,
      missing:       missing.map(t => ({ code: t.code, name: t.name, nameTh: t.nameTh })),
    };
  }

  // ── List all accounts for a tenant ────────────────────────────────────────
  async listForTenant(tenantId: string) {
    return this.prisma.accountingAccount.findMany({
      where:   { tenantId },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  // ── Create a custom (non-system) account ──────────────────────────────────
  async createCustom(tenantId: string, dto: CreateAccountDto) {
    const conflict = await this.prisma.accountingAccount.findUnique({
      where: { code_tenantId: { code: dto.code, tenantId } },
    });
    if (conflict) {
      throw new ConflictException(`Account code ${dto.code} already exists for this tenant`);
    }

    return this.prisma.accountingAccount.create({
      data: {
        code:      dto.code,
        name:      dto.name,
        nameTh:    dto.nameTh,
        type:      dto.type,
        subType:   dto.subType ?? null,
        sortOrder: dto.sortOrder ?? 999,
        tenantId,
        isSystem:  false,
        isActive:  true,
      },
    });
  }

  // ── Update an account (name, subType, sortOrder, isActive) ─────────────
  async update(id: string, tenantId: string, dto: UpdateAccountDto) {
    const account = await this.prisma.accountingAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    if (account.tenantId !== tenantId) throw new ForbiddenException('Cross-tenant access denied');

    return this.prisma.accountingAccount.update({
      where: { id },
      data:  dto,
    });
  }

  // ── Deactivate an account ─────────────────────────────────────────────────
  async deactivate(id: string, tenantId: string) {
    const account = await this.prisma.accountingAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    if (account.tenantId !== tenantId) throw new ForbiddenException('Cross-tenant access denied');

    // Check if referenced by any journal lines
    const refCount = await this.prisma.journalLine.count({ where: { accountId: id } });
    if (refCount > 0) {
      throw new ConflictException(
        `Cannot deactivate account ${account.code} — it is referenced by ${refCount} journal line(s)`,
      );
    }

    return this.prisma.accountingAccount.update({
      where: { id },
      data:  { isActive: false },
    });
  }

  // ── Activate an account ───────────────────────────────────────────────────
  async activate(id: string, tenantId: string) {
    const account = await this.prisma.accountingAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    if (account.tenantId !== tenantId) throw new ForbiddenException('Cross-tenant access denied');

    return this.prisma.accountingAccount.update({
      where: { id },
      data:  { isActive: true },
    });
  }

  // ── Resolve account by code + tenantId (used by journal services) ─────────
  async resolveByCode(code: string, tenantId: string) {
    const account = await this.prisma.accountingAccount.findUnique({
      where: { code_tenantId: { code, tenantId } },
    });
    if (!account) throw new NotFoundException(`Account code ${code} not found for tenant ${tenantId}`);
    if (!account.isActive) throw new ConflictException(`Account ${code} is inactive`);
    return account;
  }
}

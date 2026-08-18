import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountingAccountsService } from './accounting-accounts.service';
import { PrismaService } from '../database/prisma.service';
import { COA_TEMPLATE_COUNT } from './constants/chart-of-accounts';

const TENANT_ID  = 'tenant-1';
const TENANT_ID2 = 'tenant-2';
const ACCOUNT_ID = 'acc-1';

const BASE_TENANT  = { id: TENANT_ID,  shopName: 'Shop A' };
const BASE_ACCOUNT = {
  id:        ACCOUNT_ID,
  code:      '1100',
  name:      'Cash on Hand',
  nameTh:    'เงินสดในมือ',
  type:      'ASSET' as const,
  subType:   null,
  isSystem:  true,
  isActive:  true,
  sortOrder: 10,
  tenantId:  TENANT_ID,
  createdAt: new Date(),
};

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    tenant: {
      findUnique: jest.fn(),
    },
    accountingAccount: {
      findMany:   jest.fn(),
      findUnique: jest.fn(),
      createMany: jest.fn(),
      create:     jest.fn(),
      update:     jest.fn(),
      count:      jest.fn(),
    },
    journalLine: {
      count: jest.fn(),
    },
    ...overrides,
  };
}

async function build(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = makePrisma(prismaOverrides);
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AccountingAccountsService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  return { service: module.get<AccountingAccountsService>(AccountingAccountsService), prisma };
}

describe('AccountingAccountsService', () => {

  // ── 1. Initialize new tenant ──────────────────────────────────────────────

  it('1: initialize creates 17 accounts for a new tenant', async () => {
    const { service, prisma } = await build();
    prisma.tenant.findUnique.mockResolvedValue(BASE_TENANT);
    prisma.accountingAccount.findMany.mockResolvedValue([]);
    prisma.accountingAccount.createMany.mockResolvedValue({ count: COA_TEMPLATE_COUNT });

    const result = await service.initializeForTenant(TENANT_ID);

    expect(result.created).toBe(COA_TEMPLATE_COUNT);
    expect(result.skipped).toBe(0);
    expect(result.total).toBe(COA_TEMPLATE_COUNT);
    expect(prisma.accountingAccount.createMany).toHaveBeenCalledTimes(1);
  });

  it('1b: createMany receives correct data (code, name, nameTh, type, tenantId, isSystem=true)', async () => {
    const { service, prisma } = await build();
    prisma.tenant.findUnique.mockResolvedValue(BASE_TENANT);
    prisma.accountingAccount.findMany.mockResolvedValue([]);
    prisma.accountingAccount.createMany.mockResolvedValue({ count: COA_TEMPLATE_COUNT });

    await service.initializeForTenant(TENANT_ID);

    const callArg = prisma.accountingAccount.createMany.mock.calls[0][0];
    expect(callArg.skipDuplicates).toBe(true);
    expect(callArg.data).toHaveLength(COA_TEMPLATE_COUNT);
    // Spot-check first account
    expect(callArg.data[0]).toMatchObject({
      code: '1100', name: 'Cash on Hand', nameTh: 'เงินสดในมือ',
      type: 'ASSET', tenantId: TENANT_ID, isSystem: true, isActive: true,
    });
  });

  // ── 2. Initialize existing tenant (second call) ───────────────────────────

  it('2: initialize existing tenant returns created=0 and skips existing accounts', async () => {
    const { service, prisma } = await build();
    prisma.tenant.findUnique.mockResolvedValue(BASE_TENANT);
    // All 17 accounts already exist
    const allExisting = Array.from({ length: COA_TEMPLATE_COUNT }, (_, i) => ({
      code: ['1100','1110','1120','1200','1210','1300','1310','2100','2110','3100','4100','4200','4300','5100','5200','6100','6200'][i],
    }));
    prisma.accountingAccount.findMany.mockResolvedValue(allExisting);

    const result = await service.initializeForTenant(TENANT_ID);

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(COA_TEMPLATE_COUNT);
    expect(prisma.accountingAccount.createMany).not.toHaveBeenCalled();
  });

  // ── 3. Idempotent — second call creates 0 ─────────────────────────────────

  it('3: idempotent — calling twice produces same result, no error', async () => {
    const { service, prisma } = await build();
    prisma.tenant.findUnique.mockResolvedValue(BASE_TENANT);
    prisma.accountingAccount.findMany
      .mockResolvedValueOnce([])                                        // first call: none exist
      .mockResolvedValueOnce(Array.from({ length: COA_TEMPLATE_COUNT }, (_, i) => ({
        code: ['1100','1110','1120','1200','1210','1300','1310','2100','2110','3100','4100','4200','4300','5100','5200','6100','6200'][i],
      })));                                                             // second call: all exist
    prisma.accountingAccount.createMany.mockResolvedValue({ count: COA_TEMPLATE_COUNT });

    const first  = await service.initializeForTenant(TENANT_ID);
    const second = await service.initializeForTenant(TENANT_ID);

    expect(first.created).toBe(COA_TEMPLATE_COUNT);
    expect(second.created).toBe(0);
    expect(prisma.accountingAccount.createMany).toHaveBeenCalledTimes(1);
  });

  // ── 4. Race condition — duplicate creation handled by skipDuplicates ───────

  it('4: race condition — createMany with skipDuplicates=true handles concurrent init', async () => {
    const { service, prisma } = await build();
    prisma.tenant.findUnique.mockResolvedValue(BASE_TENANT);
    prisma.accountingAccount.findMany.mockResolvedValue([]);
    // Simulate race: only 10 actually created (7 already created by concurrent request)
    prisma.accountingAccount.createMany.mockResolvedValue({ count: 10 });

    const result = await service.initializeForTenant(TENANT_ID);

    expect(result.created).toBe(10);
    // Does not throw — skipDuplicates absorbed the conflict
    const callArg = prisma.accountingAccount.createMany.mock.calls[0][0];
    expect(callArg.skipDuplicates).toBe(true);
  });

  // ── 5. Tenant isolation ───────────────────────────────────────────────────

  it('5: creates accounts with the target tenantId, not another tenant\'s id', async () => {
    const { service, prisma } = await build();
    prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID2, shopName: 'Shop B' });
    prisma.accountingAccount.findMany.mockResolvedValue([]);
    prisma.accountingAccount.createMany.mockResolvedValue({ count: COA_TEMPLATE_COUNT });

    await service.initializeForTenant(TENANT_ID2);

    const callData = prisma.accountingAccount.createMany.mock.calls[0][0].data;
    expect(callData.every((d: { tenantId: string }) => d.tenantId === TENANT_ID2)).toBe(true);
    expect(callData.every((d: { tenantId: string }) => d.tenantId !== TENANT_ID)).toBe(true);
  });

  // ── 6. Tenant not found ───────────────────────────────────────────────────

  it('6: throws NotFoundException when tenant does not exist', async () => {
    const { service, prisma } = await build();
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(service.initializeForTenant('nonexistent'))
      .rejects.toThrow(NotFoundException);
    expect(prisma.accountingAccount.createMany).not.toHaveBeenCalled();
  });

  // ── 7. System account protection (deactivate) ────────────────────────────

  it('7: cannot deactivate account that has journal line references', async () => {
    const { service, prisma } = await build();
    prisma.accountingAccount.findUnique.mockResolvedValue(BASE_ACCOUNT);
    prisma.journalLine.count.mockResolvedValue(5);  // has references

    await expect(service.deactivate(ACCOUNT_ID, TENANT_ID))
      .rejects.toThrow(ConflictException);
    expect(prisma.accountingAccount.update).not.toHaveBeenCalled();
  });

  it('7b: can deactivate account with zero journal line references', async () => {
    const { service, prisma } = await build();
    prisma.accountingAccount.findUnique.mockResolvedValue(BASE_ACCOUNT);
    prisma.journalLine.count.mockResolvedValue(0);
    prisma.accountingAccount.update.mockResolvedValue({ ...BASE_ACCOUNT, isActive: false });

    const result = await service.deactivate(ACCOUNT_ID, TENANT_ID);

    expect(prisma.accountingAccount.update).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
      data:  { isActive: false },
    });
    expect(result.isActive).toBe(false);
  });

  // ── 8. Existing custom account preserved ─────────────────────────────────

  it('8: createCustom preserves existing accounts — throws ConflictException on duplicate code', async () => {
    const { service, prisma } = await build();
    prisma.accountingAccount.findUnique.mockResolvedValue(BASE_ACCOUNT); // already exists

    await expect(
      service.createCustom(TENANT_ID, {
        code: '1100', name: 'Duplicate', nameTh: 'ซ้ำ', type: 'ASSET',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.accountingAccount.create).not.toHaveBeenCalled();
  });

  it('8b: createCustom creates account when code is unique for tenant', async () => {
    const { service, prisma } = await build();
    prisma.accountingAccount.findUnique.mockResolvedValue(null); // no conflict
    const created = { ...BASE_ACCOUNT, code: '9900', isSystem: false };
    prisma.accountingAccount.create.mockResolvedValue(created);

    const result = await service.createCustom(TENANT_ID, {
      code: '9900', name: 'Custom Account', nameTh: 'บัญชีกำหนดเอง', type: 'ASSET',
    });

    expect(result.code).toBe('9900');
    expect(prisma.accountingAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isSystem: false, tenantId: TENANT_ID }),
      }),
    );
  });

  // ── 9. Dry run — conflict detection ──────────────────────────────────────

  it('9: dryRun returns correct missing/existing counts without writing', async () => {
    const { service, prisma } = await build();
    prisma.tenant.findUnique.mockResolvedValue(BASE_TENANT);
    // 3 accounts already exist
    prisma.accountingAccount.findMany.mockResolvedValue([
      { code: '1100', name: 'Cash on Hand', nameTh: 'เงินสดในมือ', isActive: true },
      { code: '1110', name: 'Bank Deposit', nameTh: 'เงินฝากธนาคาร', isActive: true },
      { code: '4100', name: 'Sales Revenue', nameTh: 'รายได้จากการขาย', isActive: true },
    ]);

    const result = await service.dryRunForTenant(TENANT_ID);

    expect(result.existingCount).toBe(3);
    expect(result.missingCount).toBe(COA_TEMPLATE_COUNT - 3);
    expect(result.wouldCreate).toBe(COA_TEMPLATE_COUNT - 3);
    expect(prisma.accountingAccount.createMany).not.toHaveBeenCalled();
    expect(prisma.accountingAccount.create).not.toHaveBeenCalled();
  });

  // ── 10. Cross-tenant isolation on update ────────────────────────────────

  it('10: update throws ForbiddenException when account belongs to different tenant', async () => {
    const { service, prisma } = await build();
    // Account belongs to TENANT_ID2, caller is TENANT_ID
    prisma.accountingAccount.findUnique.mockResolvedValue({
      ...BASE_ACCOUNT, tenantId: TENANT_ID2,
    });

    await expect(
      service.update(ACCOUNT_ID, TENANT_ID, { name: 'Hacked Name' }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.accountingAccount.update).not.toHaveBeenCalled();
  });

  // ── 11. Resolve by code — inactive account throws ────────────────────────

  it('11: resolveByCode throws ConflictException when account is inactive', async () => {
    const { service, prisma } = await build();
    prisma.accountingAccount.findUnique.mockResolvedValue({
      ...BASE_ACCOUNT, isActive: false,
    });

    await expect(service.resolveByCode('1100', TENANT_ID))
      .rejects.toThrow(ConflictException);
  });

  it('11b: resolveByCode throws NotFoundException when code does not exist', async () => {
    const { service, prisma } = await build();
    prisma.accountingAccount.findUnique.mockResolvedValue(null);

    await expect(service.resolveByCode('9999', TENANT_ID))
      .rejects.toThrow(NotFoundException);
  });

  // ── 12. Activate restores account ────────────────────────────────────────

  it('12: activate sets isActive=true for a deactivated account', async () => {
    const { service, prisma } = await build();
    prisma.accountingAccount.findUnique.mockResolvedValue({
      ...BASE_ACCOUNT, isActive: false,
    });
    prisma.accountingAccount.update.mockResolvedValue({ ...BASE_ACCOUNT, isActive: true });

    const result = await service.activate(ACCOUNT_ID, TENANT_ID);

    expect(prisma.accountingAccount.update).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
      data:  { isActive: true },
    });
    expect(result.isActive).toBe(true);
  });
});

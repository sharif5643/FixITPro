import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DebtPaymentsService } from './debt-payments.service';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccountingService, ACCOUNTING_SOURCE } from '../accounting/accounting.service';
import { RepairAccountingAdapter } from '../repairs/repair-accounting.adapter';

const BRANCH_ID = 'branch-1';
const TENANT_ID = 'tenant-1';
const REPAIR_ID = 'repair-1';
const USER_ID   = 'user-1';
const PMT_ID    = 'pmt-1';

const BASE_REPAIR = {
  id:                 REPAIR_ID,
  ticketNumber:       'REP-001',
  branchId:           BRANCH_ID,
  status:             'DELIVERED',
  paymentStatus:      'PENDING',
  finalCost:          new Prisma.Decimal('1000'),
  deposit:            new Prisma.Decimal('200'),
  deviceBrand:        'Apple',
  deviceModel:        'iPhone 14',
  additionalPayments: [],
  customer:           { id: 'cust-1', name: 'Alice', phone: '0812345678' },
  branch:             { tenantId: TENANT_ID },
};

function makePmt(id = PMT_ID) {
  return { id, amount: new Prisma.Decimal('300'), paymentMethod: 'CASH', note: undefined, createdAt: new Date() };
}

function makeRig(repairOverride: Partial<typeof BASE_REPAIR> = {}) {
  const repair = { ...BASE_REPAIR, ...repairOverride };
  const tx = {
    repairAdditionalPayment: { create: jest.fn().mockResolvedValue(makePmt()) },
    repair:                  { update: jest.fn().mockResolvedValue({}) },
    auditLog:                { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    repair:       { findUnique: jest.fn().mockResolvedValue(repair) },
    $transaction: jest.fn().mockImplementation(async (cb: (tx: any) => any) => cb(tx)),
  };
  return { prisma, tx };
}

async function build(opts: {
  repairOverride?:   Partial<typeof BASE_REPAIR>;
  accountingRecord?: jest.Mock;
} = {}) {
  const { prisma, tx } = makeRig(opts.repairOverride);
  const accounting = { record: jest.fn().mockResolvedValue({ id: 'cdt-1' }) };
  if (opts.accountingRecord) accounting.record = opts.accountingRecord;
  const notif    = { notify: jest.fn().mockResolvedValue(undefined) };
  const auditLog = { log:    jest.fn() };

  const repairAccounting = {
    isEnabledForTenant:             jest.fn().mockReturnValue(false),
    recordAdditionalPaymentJournal: jest.fn().mockResolvedValue(undefined),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DebtPaymentsService,
      { provide: PrismaService,             useValue: prisma          },
      { provide: AuditLogService,           useValue: auditLog        },
      { provide: NotificationsService,      useValue: notif           },
      { provide: AccountingService,         useValue: accounting      },
      { provide: RepairAccountingAdapter,   useValue: repairAccounting },
    ],
  }).compile();

  return {
    service:    module.get<DebtPaymentsService>(DebtPaymentsService),
    prisma,
    tx,
    accounting,
    notif,
  };
}

describe('DebtPaymentsService', () => {
  // finalCost=1000, deposit=200, additionalPayments=[], remaining=800

  // ── A: CASH → accounting.record() called with correct entry ──────────────

  it('A: calls accounting.record() for CASH with correct entry fields', async () => {
    const { service, accounting, tx } = await build();
    const dto = { repairId: REPAIR_ID, amount: 300, paymentMethod: 'CASH' };

    await service.create(dto as any, USER_ID, 'Alice', BRANCH_ID);

    expect(accounting.record).toHaveBeenCalledTimes(1);
    expect(accounting.record).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType:    ACCOUNTING_SOURCE.REPAIR_ADDITIONAL_PAYMENT,
        sourceId:      PMT_ID,
        paymentMethod: 'CASH',
        amount:        300,
        direction:     'IN',
        branchId:      BRANCH_ID,
        tenantId:      TENANT_ID,
        actorUserId:   USER_ID,
      }),
      tx,
    );
  });

  // ── B: TRANSFER → accounting.record() called ─────────────────────────────

  it('B: calls accounting.record() for TRANSFER payment', async () => {
    const { service, accounting } = await build();
    const dto = { repairId: REPAIR_ID, amount: 300, paymentMethod: 'TRANSFER' };

    await service.create(dto as any, USER_ID, 'Alice', BRANCH_ID);

    expect(accounting.record).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType:    ACCOUNTING_SOURCE.REPAIR_ADDITIONAL_PAYMENT,
        paymentMethod: 'TRANSFER',
        direction:     'IN',
      }),
      expect.anything(),
    );
  });

  // ── C: CARD → accounting.record() called ─────────────────────────────────

  it('C: calls accounting.record() for CARD payment', async () => {
    const { service, accounting } = await build();
    const dto = { repairId: REPAIR_ID, amount: 300, paymentMethod: 'CARD' };

    await service.create(dto as any, USER_ID, 'Alice', BRANCH_ID);

    expect(accounting.record).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: 'CARD' }),
      expect.anything(),
    );
  });

  // ── D: tx client is forwarded (write is atomic) ───────────────────────────

  it('D: passes the transaction client to accounting.record() as second argument', async () => {
    const { service, accounting, tx } = await build();
    const dto = { repairId: REPAIR_ID, amount: 300, paymentMethod: 'CASH' };

    await service.create(dto as any, USER_ID, 'Alice', BRANCH_ID);

    const secondArg = (accounting.record as jest.Mock).mock.calls[0][1];
    expect(secondArg).toBe(tx);
  });

  // ── E: rollback — if accounting.record() throws, the transaction aborts ───

  it('E: rejects and rolls back when accounting.record() throws', async () => {
    const failRecord = jest.fn().mockRejectedValue(new Error('Ledger write failed'));
    const { service } = await build({ accountingRecord: failRecord });
    const dto = { repairId: REPAIR_ID, amount: 300, paymentMethod: 'CASH' };

    await expect(service.create(dto as any, USER_ID, 'Alice', BRANCH_ID))
      .rejects.toThrow('Ledger write failed');
  });

  // ── F: partial payment → paymentStatus stays PARTIAL ─────────────────────

  it('F: partial payment — response shows PARTIAL status and correct remainingAfter', async () => {
    const { service } = await build();
    const dto = { repairId: REPAIR_ID, amount: 300, paymentMethod: 'CASH' };

    const result = await service.create(dto as any, USER_ID, 'Alice', BRANCH_ID);

    expect(result.repair.paymentStatus).toBe('PARTIAL');
    expect(result.repair.remainingAfter).toBeCloseTo(500);
  });

  // ── G: final payment → paymentStatus becomes PAID + DEBT_PAID notification ─

  it('G: final payment — status becomes PAID and sends DEBT_PAID notification', async () => {
    const { service, notif } = await build();
    // paying exactly the remaining 800 → PAID
    const dto = { repairId: REPAIR_ID, amount: 800, paymentMethod: 'CASH' };

    const result = await service.create(dto as any, USER_ID, 'Alice', BRANCH_ID);

    expect(result.repair.paymentStatus).toBe('PAID');
    expect(result.repair.remainingAfter).toBeCloseTo(0);
    expect(notif.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DEBT_PAID' }),
    );
  });

  // ── H: tenant isolation — tenantId from repair.branch.tenantId ───────────

  it('H: derives tenantId from repair.branch.tenantId, not from caller', async () => {
    const { service, accounting } = await build({
      repairOverride: { branch: { tenantId: 'tenant-xyz' } },
    });
    const dto = { repairId: REPAIR_ID, amount: 300, paymentMethod: 'CASH' };

    await service.create(dto as any, USER_ID, 'Alice', BRANCH_ID);

    expect(accounting.record).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-xyz' }),
      expect.anything(),
    );
  });

  // ── I: branch isolation — ForbiddenException on wrong branch ─────────────

  it('I: throws ForbiddenException when caller branchId does not match repair.branchId', async () => {
    const { service } = await build();
    const dto = { repairId: REPAIR_ID, amount: 300, paymentMethod: 'CASH' };

    await expect(service.create(dto as any, USER_ID, 'Alice', 'branch-OTHER'))
      .rejects.toThrow(ForbiddenException);
  });

  // ── J: repair must be DELIVERED ───────────────────────────────────────────

  it('J: throws BadRequestException when repair status is not DELIVERED', async () => {
    const { service } = await build({ repairOverride: { status: 'IN_PROGRESS' as any } });
    const dto = { repairId: REPAIR_ID, amount: 300, paymentMethod: 'CASH' };

    await expect(service.create(dto as any, USER_ID, 'Alice', BRANCH_ID))
      .rejects.toThrow(BadRequestException);
  });

  // ── K: already paid repair is rejected ───────────────────────────────────

  it('K: throws BadRequestException when repair is already PAID', async () => {
    const { service } = await build({ repairOverride: { paymentStatus: 'PAID' as any } });
    const dto = { repairId: REPAIR_ID, amount: 300, paymentMethod: 'CASH' };

    await expect(service.create(dto as any, USER_ID, 'Alice', BRANCH_ID))
      .rejects.toThrow(BadRequestException);
  });

  // ── L: overpayment is rejected ────────────────────────────────────────────

  it('L: throws BadRequestException when amount exceeds remaining balance', async () => {
    const { service } = await build();
    // remaining = 800; trying to pay 900
    const dto = { repairId: REPAIR_ID, amount: 900, paymentMethod: 'CASH' };

    await expect(service.create(dto as any, USER_ID, 'Alice', BRANCH_ID))
      .rejects.toThrow(BadRequestException);
  });

  // ── M: NotFoundException when repair does not exist ──────────────────────

  it('M: throws NotFoundException when repairId does not exist', async () => {
    const { service, prisma } = await build();
    (prisma.repair.findUnique as jest.Mock).mockResolvedValue(null);
    const dto = { repairId: 'nonexistent', amount: 300, paymentMethod: 'CASH' };

    await expect(service.create(dto as any, USER_ID, 'Alice', BRANCH_ID))
      .rejects.toThrow(NotFoundException);
  });
});

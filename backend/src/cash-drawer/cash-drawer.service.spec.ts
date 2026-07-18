import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CashDrawerService } from './cash-drawer.service';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CashDrawerSessionStatus, Prisma } from '@prisma/client';

// ── Shared actor stubs ────────────────────────────────────────────────────────

const ACTOR = {
  id:       'user-1',
  name:     'Test User',
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  permissions: [] as string[],
};

const SESSION_OPEN = {
  id:             'session-1',
  cashDrawerId:   'drawer-1',
  branchId:       'branch-1',
  tenantId:       'tenant-1',
  status:         CashDrawerSessionStatus.OPEN,
  openedAt:       new Date(),
  closedAt:       null,
  openingAmount:  new Prisma.Decimal(1000),
  expectedAmount: new Prisma.Decimal(1000),
  countedAmount:  null,
};

// ── Prisma mock factory ───────────────────────────────────────────────────────

function makePrismaMock(overrides: Partial<any> = {}) {
  return {
    cashDrawer: {
      findFirst:  jest.fn(),
      findMany:   jest.fn(),
      create:     jest.fn(),
    },
    cashDrawerSession: {
      findFirst:  jest.fn(),
      findUnique: jest.fn(),
      findMany:   jest.fn(),
      create:     jest.fn(),
      update:     jest.fn(),
      count:      jest.fn(),
    },
    cashDrawerParticipant: {
      findFirst:  jest.fn(),
      create:     jest.fn(),
      update:     jest.fn(),
      updateMany: jest.fn(),
    },
    cashDrawerTransaction: {
      findMany:  jest.fn(),
      findUnique: jest.fn(),
      create:    jest.fn(),
    },
    $transaction: jest.fn((fn: any) => fn({
      cashDrawerSession: {
        create:    jest.fn().mockResolvedValue(SESSION_OPEN),
        update:    jest.fn().mockResolvedValue(SESSION_OPEN),
      },
      cashDrawerParticipant: {
        create:     jest.fn().mockResolvedValue({ id: 'p-1', sessionId: 'session-1', userId: 'user-1' }),
        updateMany: jest.fn(),
      },
      cashDrawerTransaction: {
        create: jest.fn().mockResolvedValue({ id: 'tx-1' }),
      },
    })),
    ...overrides,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('CashDrawerService', () => {
  let service: CashDrawerService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let auditLog: { log: jest.Mock };
  let notif: { notify: jest.Mock };

  beforeEach(async () => {
    prisma   = makePrismaMock();
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    notif    = { notify: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashDrawerService,
        { provide: PrismaService,       useValue: prisma },
        { provide: AuditLogService,     useValue: auditLog },
        { provide: NotificationsService, useValue: notif },
      ],
    }).compile();

    service = module.get<CashDrawerService>(CashDrawerService);
  });

  // ── 1. openSession: happy path ─────────────────────────────────────────────
  describe('openSession', () => {
    it('creates a new session and OPENING ledger entry', async () => {
      prisma.cashDrawer.findFirst.mockResolvedValue({ id: 'drawer-1' });
      prisma.cashDrawerSession.findFirst.mockResolvedValue(null); // no existing

      const result = await service.openSession({ openingAmount: 1000 }, ACTOR);

      expect(result).toBeDefined();
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CASH_DRAWER_SESSION_OPENED' }),
      );
    });

    // ── 2. openSession: duplicate open blocks ──────────────────────────────
    it('throws ConflictException if an open session already exists for the drawer', async () => {
      prisma.cashDrawer.findFirst.mockResolvedValue({ id: 'drawer-1' });
      prisma.cashDrawerSession.findFirst.mockResolvedValue(SESSION_OPEN); // already open

      await expect(service.openSession({ openingAmount: 500 }, ACTOR))
        .rejects.toBeInstanceOf(ConflictException);
    });

    // ── 3. openSession: negative opening amount ────────────────────────────
    it('throws BadRequestException for negative openingAmount', async () => {
      await expect(service.openSession({ openingAmount: -1 }, ACTOR))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    // ── 4. openSession: actor without branchId ─────────────────────────────
    it('throws BadRequestException when actor has no branchId', async () => {
      await expect(
        service.openSession({ openingAmount: 0 }, { ...ACTOR, branchId: null }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── 5. joinSession ─────────────────────────────────────────────────────────
  describe('joinSession', () => {
    it('creates participant row and logs JOINED audit event', async () => {
      prisma.cashDrawerSession.findUnique.mockResolvedValue(SESSION_OPEN);
      prisma.cashDrawerParticipant.findFirst.mockResolvedValue(null);
      prisma.cashDrawerParticipant.create.mockResolvedValue({ id: 'p-2', userId: 'user-2' });

      await service.joinSession('session-1', { ...ACTOR, id: 'user-2', name: 'User 2' });

      expect(prisma.cashDrawerParticipant.create).toHaveBeenCalled();
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CASH_DRAWER_SESSION_JOINED' }),
      );
    });

    it('throws ConflictException if user is already an active participant', async () => {
      prisma.cashDrawerSession.findUnique.mockResolvedValue(SESSION_OPEN);
      prisma.cashDrawerParticipant.findFirst.mockResolvedValue({ id: 'p-1', leftAt: null });

      await expect(service.joinSession('session-1', ACTOR))
        .rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ── 6. leaveSession ────────────────────────────────────────────────────────
  describe('leaveSession', () => {
    it('sets leftAt on participant', async () => {
      prisma.cashDrawerParticipant.findFirst.mockResolvedValue({ id: 'p-1', leftAt: null });
      prisma.cashDrawerParticipant.update.mockResolvedValue({ id: 'p-1', leftAt: new Date() });

      await service.leaveSession('session-1', ACTOR);

      expect(prisma.cashDrawerParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ leftAt: expect.any(Date) }) }),
      );
    });

    it('throws NotFoundException if user has no active participation', async () => {
      prisma.cashDrawerParticipant.findFirst.mockResolvedValue(null);

      await expect(service.leaveSession('session-1', ACTOR))
        .rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── 7. withdraw ────────────────────────────────────────────────────────────
  describe('withdraw', () => {
    it('creates WITHDRAWAL OUT transaction and logs audit event', async () => {
      prisma.cashDrawerSession.findUnique.mockResolvedValue(SESSION_OPEN);
      const tx = { id: 'tx-w1', type: 'WITHDRAWAL', direction: 'OUT' };
      prisma.cashDrawerTransaction.create.mockResolvedValue(tx);

      const result = await service.withdraw('session-1', { amount: 200, reason: 'ซื้ออุปกรณ์' }, ACTOR);

      expect(result).toEqual(tx);
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CASH_DRAWER_WITHDRAWAL_CREATED' }),
      );
    });

    it('sends notification when withdrawal amount >= 1000', async () => {
      prisma.cashDrawerSession.findUnique.mockResolvedValue(SESSION_OPEN);
      prisma.cashDrawerTransaction.create.mockResolvedValue({ id: 'tx-w2' });

      await service.withdraw('session-1', { amount: 1000, reason: 'ค่าจ้าง' }, ACTOR);

      expect(notif.notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CASH_DRAWER_LARGE_WITHDRAWAL' }),
      );
    });

    it('throws BadRequestException for amount <= 0', async () => {
      await expect(
        service.withdraw('session-1', { amount: 0, reason: 'test' }, ACTOR),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── 8. deposit ─────────────────────────────────────────────────────────────
  describe('deposit', () => {
    it('creates DEPOSIT IN transaction', async () => {
      prisma.cashDrawerSession.findUnique.mockResolvedValue(SESSION_OPEN);
      const tx = { id: 'tx-d1', type: 'DEPOSIT', direction: 'IN' };
      prisma.cashDrawerTransaction.create.mockResolvedValue(tx);

      const result = await service.deposit('session-1', { amount: 500, reason: 'เติมเงินทอน' }, ACTOR);

      expect(result).toEqual(tx);
      expect(prisma.cashDrawerTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'DEPOSIT', direction: 'IN' }),
        }),
      );
    });
  });

  // ── 9. closeSession: exact match (no difference) → CLOSED directly ─────────
  describe('closeSession', () => {
    it('sets status CLOSED when counted equals expected', async () => {
      prisma.cashDrawerSession.findUnique.mockResolvedValue(SESSION_OPEN);
      // OPENING entry IN 1000 → expected = 1000
      prisma.cashDrawerTransaction.findMany.mockResolvedValue([
        { direction: 'IN', amount: new Prisma.Decimal(1000) },
      ]);
      const updatedSession = { ...SESSION_OPEN, status: CashDrawerSessionStatus.CLOSED };
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const txClient = {
          cashDrawerSession:     { update: jest.fn().mockResolvedValue(updatedSession) },
          cashDrawerParticipant: { updateMany: jest.fn() },
        };
        return fn(txClient);
      });

      const result = await service.closeSession(
        'session-1',
        { countedAmount: 1000 },
        { ...ACTOR, permissions: [] },
      );

      expect(result.status).toBe(CashDrawerSessionStatus.CLOSED);
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CASH_DRAWER_SESSION_CLOSED' }),
      );
    });

    // ── 10. closeSession: difference → PENDING_APPROVAL (no approve_difference perm) ─
    it('sets status PENDING_APPROVAL when counted differs and actor lacks approve_difference', async () => {
      prisma.cashDrawerSession.findUnique.mockResolvedValue(SESSION_OPEN);
      // OPENING IN 1000 → expected = 1000; counted = 900 → diff = -100
      prisma.cashDrawerTransaction.findMany.mockResolvedValue([
        { direction: 'IN', amount: new Prisma.Decimal(1000) },
      ]);
      const pendingSession = { ...SESSION_OPEN, status: CashDrawerSessionStatus.PENDING_APPROVAL };
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const txClient = {
          cashDrawerSession:     { update: jest.fn().mockResolvedValue(pendingSession) },
          cashDrawerParticipant: { updateMany: jest.fn() },
        };
        return fn(txClient);
      });

      const result = await service.closeSession(
        'session-1',
        { countedAmount: 900, differenceReason: 'เงินหาย' },
        { ...ACTOR, permissions: [] },
      );

      expect(result.status).toBe(CashDrawerSessionStatus.PENDING_APPROVAL);
      expect(notif.notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CASH_DRAWER_DIFFERENCE' }),
      );
    });

    // ── 11. closeSession: actor with approve_difference → CLOSED directly ──
    it('sets status CLOSED directly when actor has approve_difference permission', async () => {
      prisma.cashDrawerSession.findUnique.mockResolvedValue(SESSION_OPEN);
      // OPENING IN 1000 → expected = 1000; counted = 800 → diff = -200 (actor can self-approve)
      prisma.cashDrawerTransaction.findMany.mockResolvedValue([
        { direction: 'IN', amount: new Prisma.Decimal(1000) },
      ]);
      const closedSession = { ...SESSION_OPEN, status: CashDrawerSessionStatus.CLOSED };
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const txClient = {
          cashDrawerSession:     { update: jest.fn().mockResolvedValue(closedSession) },
          cashDrawerParticipant: { updateMany: jest.fn() },
        };
        return fn(txClient);
      });

      const result = await service.closeSession(
        'session-1',
        { countedAmount: 800, differenceReason: 'ทดสอบ' },
        { ...ACTOR, permissions: ['cash_drawer.approve_difference'] },
      );

      expect(result.status).toBe(CashDrawerSessionStatus.CLOSED);
    });

    it('throws BadRequestException when difference exists but no differenceReason provided', async () => {
      prisma.cashDrawerSession.findUnique.mockResolvedValue(SESSION_OPEN);
      // OPENING IN 1000 → expected = 1000; counted = 900 → diff = -100, no differenceReason
      prisma.cashDrawerTransaction.findMany.mockResolvedValue([
        { direction: 'IN', amount: new Prisma.Decimal(1000) },
      ]);

      await expect(
        service.closeSession(
          'session-1',
          { countedAmount: 900 },
          { ...ACTOR, permissions: [] },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── 12. cross-tenant isolation ─────────────────────────────────────────────
  describe('cross-tenant isolation', () => {
    it('throws ForbiddenException when actor tenantId does not match session tenantId', async () => {
      prisma.cashDrawerSession.findUnique.mockResolvedValue({
        ...SESSION_OPEN,
        tenantId: 'tenant-OTHER',
      });

      await expect(
        service.withdraw('session-1', { amount: 100, reason: 'test' }, {
          ...ACTOR,
          tenantId: 'tenant-1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

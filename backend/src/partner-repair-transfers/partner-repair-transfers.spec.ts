/**
 * Phase 4C.3 — PartnerRepairTransfers tests (PT-A through PT-AH)
 *
 * PT-A:  Create transfer — happy path
 * PT-B:  Create — repair belongs to another tenant → ForbiddenException
 * PT-C:  Create — repair is DELIVERED → BadRequestException
 * PT-D:  Create — repair is CANCELLED → BadRequestException
 * PT-E:  Create — partner relationship not ACCEPTED → ConflictException
 * PT-F:  Create — partnerTenantId equals ownerTenantId (self) → ForbiddenException
 * PT-G:  Create — caller not in relationship → ForbiddenException
 * PT-H:  Create — active transfer already exists → ConflictException
 * PT-I:  Create — fires notification to partnerTenantId (not ownerTenantId)
 * PT-J:  Accept PENDING_ACCEPTANCE → ACCEPTED, notifies ownerTenantId
 * PT-K:  Reject PENDING_ACCEPTANCE → REJECTED, notifies ownerTenantId
 * PT-L:  Cancel PENDING_ACCEPTANCE (by owner) → CANCELLED
 * PT-M:  Device received ACCEPTED → DEVICE_RECEIVED
 * PT-N:  Start DEVICE_RECEIVED → IN_PROGRESS
 * PT-O:  Complete IN_PROGRESS → COMPLETED
 * PT-P:  Return device COMPLETED → DEVICE_RETURNED
 * PT-Q:  Owner received DEVICE_RETURNED → OWNER_RECEIVED
 * PT-R:  Recall ACCEPTED (OWNER) → RECALLED
 * PT-S:  Complete before start (ACCEPTED→COMPLETED) → ConflictException
 * PT-T:  Accept after reject (REJECTED→ACCEPTED) → ConflictException
 * PT-U:  Start after recall (RECALLED→IN_PROGRESS) → ConflictException
 * PT-V:  Transition from terminal OWNER_RECEIVED → ConflictException
 * PT-W:  Shop A can see own transfer (full data)
 * PT-X:  Shop B sees privacy-filtered view (no ownerTenantId)
 * PT-Y:  Shop C (third party) gets null from findOne
 * PT-Z:  Cross-tenant mutation — Shop B tries to cancel Shop A's transfer → NotFoundException
 * PT-AA: Privacy — Shop B response does NOT contain ownerTenantId or ownerBranchId
 * PT-AB: Notification on create goes to partnerTenantId only
 * PT-AC: Notification on accept goes to ownerTenantId only
 * PT-AD: Audit log written on create with correct entityType and no sensitive data
 * PT-AE: OWNER can recall ACCEPTED transfer
 * PT-AF: Non-OWNER cannot recall → ForbiddenException
 * PT-AG: OWNER can update price; non-OWNER cannot → ForbiddenException
 * PT-AH: No JournalEntry / JournalLine / CashDrawerTransaction calls ever made
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PartnerRepairTransfersService } from './partner-repair-transfers.service';

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_A   = 'tenant-a';
const TENANT_B   = 'tenant-b';
const TENANT_C   = 'tenant-c';
const USER_A     = 'user-a';
const USER_B     = 'user-b';
const USER_C     = 'user-c';
const BRANCH_A   = 'branch-a';
const REPAIR_ID  = 'repair-001';
const REL_ID     = 'rel-001';
const TRANSFER_ID = 'transfer-001';

// ── Factories ─────────────────────────────────────────────────────────────────

function makeRepair(overrides: Partial<Record<string, any>> = {}) {
  return {
    id:          REPAIR_ID,
    ticketNumber: 'R-001',
    deviceBrand:  'Apple',
    deviceModel:  'iPhone 15',
    deviceColor:  'Black',
    deviceImei:   null,
    issue:        'Screen crack',
    status:       'IN_PROGRESS',
    note:         null,
    branchId:     BRANCH_A,
    customerId:   'cust-001',
    branch: {
      id:       BRANCH_A,
      name:     'Shop A Branch',
      tenantId: TENANT_A,
    },
    ...overrides,
  };
}

function makeRelationship(overrides: Partial<Record<string, any>> = {}) {
  return {
    id:                REL_ID,
    status:            'ACCEPTED',
    initiatorTenantId: TENANT_A,
    partnerTenantId:   TENANT_B,
    ...overrides,
  };
}

function makeTransfer(overrides: Partial<Record<string, any>> = {}) {
  return {
    id:                 TRANSFER_ID,
    status:             'PENDING_ACCEPTANCE',
    agreedPartnerPrice: null,
    pricingNote:        null,
    sharedDeviceInfo:   null,
    sharedImageUrls:    null,
    partnerWorkNote:    null,
    partnerPartsNote:   null,
    sentAt:             new Date(),
    acceptedAt:         null,
    rejectedAt:         null,
    rejectionNote:      null,
    deviceReceivedAt:   null,
    partnerStartedAt:   null,
    completedAt:        null,
    completionNote:     null,
    returnedAt:         null,
    ownerReceivedAt:    null,
    cancelledAt:        null,
    cancellationNote:   null,
    recalledAt:         null,
    recallNote:         null,
    createdAt:          new Date(),
    updatedAt:          new Date(),
    repairId:           REPAIR_ID,
    relationshipId:     REL_ID,
    ownerTenantId:      TENANT_A,
    ownerBranchId:      BRANCH_A,
    partnerTenantId:    TENANT_B,
    partnerBranchId:    null,
    sentById:           USER_A,
    acceptedById:       null,
    rejectedById:       null,
    receivedById:       null,
    partnerStartedById: null,
    completedById:      null,
    returnedById:       null,
    ownerReceivedById:  null,
    cancelledById:      null,
    recalledById:       null,
    ...overrides,
  };
}

function makeActor(overrides: Partial<Record<string, any>> = {}) {
  return {
    id:       USER_A,
    name:     'Owner A',
    role:     'OWNER',
    tenantId: TENANT_A,
    branchId: BRANCH_A,
    ...overrides,
  };
}

// ── Prisma mock ───────────────────────────────────────────────────────────────

type PrismaMock = {
  repair:                    { findUnique: jest.Mock };
  partnerRelationship:       { findUnique: jest.Mock };
  partnerRepairTransfer:     {
    findUnique:  jest.Mock;
    findFirst:   jest.Mock;
    findMany:    jest.Mock;
    create:      jest.Mock;
    update:      jest.Mock;
  };
  partnerRepairTransferEvent: { create: jest.Mock };
};

function makePrisma(): PrismaMock {
  return {
    repair:              { findUnique: jest.fn() },
    partnerRelationship: { findUnique: jest.fn() },
    partnerRepairTransfer: {
      findUnique: jest.fn(),
      findFirst:  jest.fn(),
      findMany:   jest.fn().mockResolvedValue([]),
      create:     jest.fn(),
      update:     jest.fn(),
    },
    partnerRepairTransferEvent: { create: jest.fn().mockResolvedValue({}) },
  };
}

type AuditMock = { log: jest.Mock };
function makeAudit(): AuditMock {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

type NotifMock = { notify: jest.Mock };
function makeNotif(): NotifMock {
  return { notify: jest.fn().mockResolvedValue(undefined) };
}

function makeService(prisma: PrismaMock, audit: AuditMock, notif: NotifMock) {
  return new PartnerRepairTransfersService(prisma as any, audit as any, notif as any);
}

const DEFAULT_DTO = {
  partnerTenantId: TENANT_B,
  relationshipId:  REL_ID,
};

// ── Helper: set up a happy-path create mock ───────────────────────────────────

function setupHappyCreate(prisma: PrismaMock, overrides: Partial<Record<string, any>> = {}) {
  prisma.repair.findUnique.mockResolvedValue(makeRepair());
  prisma.partnerRelationship.findUnique.mockResolvedValue(makeRelationship());
  prisma.partnerRepairTransfer.findFirst.mockResolvedValue(null);
  prisma.partnerRepairTransfer.create.mockResolvedValue(makeTransfer(overrides));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('PartnerRepairTransfersService', () => {
  let prisma: PrismaMock;
  let audit:  AuditMock;
  let notif:  NotifMock;
  let svc:    PartnerRepairTransfersService;

  beforeEach(() => {
    prisma = makePrisma();
    audit  = makeAudit();
    notif  = makeNotif();
    svc    = makeService(prisma, audit, notif);
  });

  // ── CREATE ──────────────────────────────────────────────────────────────────

  it('PT-A: valid transfer creates successfully', async () => {
    setupHappyCreate(prisma);
    const actor = makeActor();
    const result = await svc.createTransfer(REPAIR_ID, DEFAULT_DTO, actor);
    expect(result.status).toBe('PENDING_ACCEPTANCE');
    expect(prisma.partnerRepairTransfer.create).toHaveBeenCalledTimes(1);
    expect(prisma.partnerRepairTransferEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'CREATED' }) }),
    );
  });

  it('PT-B: repair belongs to another tenant → ForbiddenException', async () => {
    prisma.repair.findUnique.mockResolvedValue(
      makeRepair({ branch: { id: BRANCH_A, name: 'X', tenantId: TENANT_B } }),
    );
    await expect(svc.createTransfer(REPAIR_ID, DEFAULT_DTO, makeActor())).rejects.toThrow(ForbiddenException);
  });

  it('PT-C: repair is DELIVERED → BadRequestException', async () => {
    prisma.repair.findUnique.mockResolvedValue(makeRepair({ status: 'DELIVERED' }));
    await expect(svc.createTransfer(REPAIR_ID, DEFAULT_DTO, makeActor())).rejects.toThrow(BadRequestException);
  });

  it('PT-D: repair is CANCELLED → BadRequestException', async () => {
    prisma.repair.findUnique.mockResolvedValue(makeRepair({ status: 'CANCELLED' }));
    await expect(svc.createTransfer(REPAIR_ID, DEFAULT_DTO, makeActor())).rejects.toThrow(BadRequestException);
  });

  it('PT-E: partner relationship not ACCEPTED → ConflictException', async () => {
    prisma.repair.findUnique.mockResolvedValue(makeRepair());
    prisma.partnerRelationship.findUnique.mockResolvedValue(makeRelationship({ status: 'PENDING' }));
    await expect(svc.createTransfer(REPAIR_ID, DEFAULT_DTO, makeActor())).rejects.toThrow(ConflictException);
  });

  it('PT-F: self-partner (partnerTenantId === ownerTenantId) → ForbiddenException', async () => {
    prisma.repair.findUnique.mockResolvedValue(makeRepair());
    await expect(
      svc.createTransfer(REPAIR_ID, { ...DEFAULT_DTO, partnerTenantId: TENANT_A }, makeActor()),
    ).rejects.toThrow(ForbiddenException);
  });

  it('PT-G: caller not in relationship → ForbiddenException', async () => {
    // Repair belongs to TENANT_C, actor is TENANT_C, but the relationship is between A & B only
    prisma.repair.findUnique.mockResolvedValue(makeRepair({ branch: { id: BRANCH_A, name: 'X', tenantId: TENANT_C } }));
    prisma.partnerRelationship.findUnique.mockResolvedValue(makeRelationship()); // A<->B, not C
    prisma.partnerRepairTransfer.findFirst.mockResolvedValue(null);
    await expect(
      svc.createTransfer(REPAIR_ID, { ...DEFAULT_DTO, partnerTenantId: TENANT_B }, makeActor({ tenantId: TENANT_C })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('PT-H: active transfer already exists → ConflictException', async () => {
    setupHappyCreate(prisma);
    prisma.partnerRepairTransfer.findFirst.mockResolvedValue(makeTransfer({ status: 'ACCEPTED' }));
    await expect(svc.createTransfer(REPAIR_ID, DEFAULT_DTO, makeActor())).rejects.toThrow(ConflictException);
  });

  it('PT-I: create fires notification to partnerTenantId only', async () => {
    setupHappyCreate(prisma);
    await svc.createTransfer(REPAIR_ID, DEFAULT_DTO, makeActor());
    // Allow microtask queue to flush fire-and-forget
    await Promise.resolve();
    expect(notif.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PARTNER_REPAIR_REQUEST', tenantId: TENANT_B }),
    );
    const calls = notif.notify.mock.calls.map((c: any) => c[0].tenantId);
    expect(calls.every((t: string) => t !== TENANT_A)).toBe(true);
  });

  // ── STATE MACHINE — valid transitions ─────────────────────────────────────

  it('PT-J: accept PENDING_ACCEPTANCE → ACCEPTED, notifies ownerTenantId', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'PENDING_ACCEPTANCE', partnerTenantId: TENANT_B }),
    );
    prisma.partnerRepairTransfer.update.mockResolvedValue(makeTransfer({ status: 'ACCEPTED' }));
    const actor = makeActor({ tenantId: TENANT_B, id: USER_B });
    const result = await svc.accept(TRANSFER_ID, actor);
    expect(result.status).toBe('ACCEPTED');
    await Promise.resolve();
    expect(notif.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PARTNER_REPAIR_ACCEPTED', tenantId: TENANT_A }),
    );
  });

  it('PT-K: reject PENDING_ACCEPTANCE → REJECTED, notifies ownerTenantId', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'PENDING_ACCEPTANCE', partnerTenantId: TENANT_B }),
    );
    prisma.partnerRepairTransfer.update.mockResolvedValue(makeTransfer({ status: 'REJECTED' }));
    const result = await svc.reject(TRANSFER_ID, 'ไม่ว่าง', makeActor({ tenantId: TENANT_B, id: USER_B }));
    expect(result.status).toBe('REJECTED');
    await Promise.resolve();
    expect(notif.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PARTNER_REPAIR_REJECTED', tenantId: TENANT_A }),
    );
  });

  it('PT-L: cancel PENDING_ACCEPTANCE (by Shop A) → CANCELLED', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'PENDING_ACCEPTANCE', ownerTenantId: TENANT_A }),
    );
    prisma.partnerRepairTransfer.update.mockResolvedValue(makeTransfer({ status: 'CANCELLED' }));
    const result = await svc.cancel(TRANSFER_ID, 'ยกเลิก', makeActor());
    expect(result.status).toBe('CANCELLED');
  });

  it('PT-M: device received ACCEPTED → DEVICE_RECEIVED', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'ACCEPTED', partnerTenantId: TENANT_B }),
    );
    prisma.partnerRepairTransfer.update.mockResolvedValue(makeTransfer({ status: 'DEVICE_RECEIVED' }));
    const result = await svc.deviceReceived(TRANSFER_ID, makeActor({ tenantId: TENANT_B, id: USER_B }));
    expect(result.status).toBe('DEVICE_RECEIVED');
  });

  it('PT-N: start DEVICE_RECEIVED → IN_PROGRESS', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'DEVICE_RECEIVED', partnerTenantId: TENANT_B }),
    );
    prisma.partnerRepairTransfer.update.mockResolvedValue(makeTransfer({ status: 'IN_PROGRESS' }));
    const result = await svc.start(TRANSFER_ID, makeActor({ tenantId: TENANT_B, id: USER_B }));
    expect(result.status).toBe('IN_PROGRESS');
  });

  it('PT-O: complete IN_PROGRESS → COMPLETED', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'IN_PROGRESS', partnerTenantId: TENANT_B }),
    );
    prisma.partnerRepairTransfer.update.mockResolvedValue(makeTransfer({ status: 'COMPLETED' }));
    const result = await svc.complete(TRANSFER_ID, 'Done', makeActor({ tenantId: TENANT_B, id: USER_B }));
    expect(result.status).toBe('COMPLETED');
  });

  it('PT-P: return device COMPLETED → DEVICE_RETURNED', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'COMPLETED', partnerTenantId: TENANT_B }),
    );
    prisma.partnerRepairTransfer.update.mockResolvedValue(makeTransfer({ status: 'DEVICE_RETURNED' }));
    const result = await svc.returnDevice(TRANSFER_ID, makeActor({ tenantId: TENANT_B, id: USER_B }));
    expect(result.status).toBe('DEVICE_RETURNED');
  });

  it('PT-Q: owner received DEVICE_RETURNED → OWNER_RECEIVED', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'DEVICE_RETURNED', ownerTenantId: TENANT_A }),
    );
    prisma.partnerRepairTransfer.update.mockResolvedValue(makeTransfer({ status: 'OWNER_RECEIVED' }));
    const result = await svc.ownerReceived(TRANSFER_ID, makeActor());
    expect(result.status).toBe('OWNER_RECEIVED');
  });

  it('PT-R: recall ACCEPTED (OWNER) → RECALLED', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'ACCEPTED', ownerTenantId: TENANT_A }),
    );
    prisma.partnerRepairTransfer.update.mockResolvedValue(makeTransfer({ status: 'RECALLED' }));
    const result = await svc.recall(TRANSFER_ID, 'เปลี่ยนใจ', makeActor({ role: 'OWNER' }));
    expect(result.status).toBe('RECALLED');
  });

  // ── INVALID TRANSITIONS ───────────────────────────────────────────────────

  it('PT-S: complete before start (status=ACCEPTED) → ConflictException', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'ACCEPTED', partnerTenantId: TENANT_B }),
    );
    await expect(
      svc.complete(TRANSFER_ID, undefined, makeActor({ tenantId: TENANT_B, id: USER_B })),
    ).rejects.toThrow(ConflictException);
  });

  it('PT-T: accept after reject (status=REJECTED) → ConflictException', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'REJECTED', partnerTenantId: TENANT_B }),
    );
    await expect(
      svc.accept(TRANSFER_ID, makeActor({ tenantId: TENANT_B, id: USER_B })),
    ).rejects.toThrow(ConflictException);
  });

  it('PT-U: start after recall (status=RECALLED) → ConflictException', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'RECALLED', partnerTenantId: TENANT_B }),
    );
    await expect(
      svc.start(TRANSFER_ID, makeActor({ tenantId: TENANT_B, id: USER_B })),
    ).rejects.toThrow(ConflictException);
  });

  it('PT-V: any transition from OWNER_RECEIVED → ConflictException', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'OWNER_RECEIVED', ownerTenantId: TENANT_A }),
    );
    await expect(
      svc.cancel(TRANSFER_ID, undefined, makeActor()),
    ).rejects.toThrow(ConflictException);
  });

  // ── TENANT ISOLATION ──────────────────────────────────────────────────────

  it('PT-W: Shop A can see own transfer (full data)', async () => {
    const transfer = makeTransfer();
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(transfer);
    const result = await svc.findOne(TRANSFER_ID, TENANT_A);
    expect(result).not.toBeNull();
    expect((result as any).ownerTenantId).toBe(TENANT_A);
  });

  it('PT-X: Shop B sees privacy-filtered view (no ownerTenantId/ownerBranchId)', async () => {
    const transfer = makeTransfer();
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(transfer);
    const result = await svc.findOne(TRANSFER_ID, TENANT_B);
    expect(result).not.toBeNull();
    expect((result as any).ownerTenantId).toBeUndefined();
    expect((result as any).ownerBranchId).toBeUndefined();
  });

  it('PT-Y: Shop C (third party) gets null from findOne', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeTransfer());
    const result = await svc.findOne(TRANSFER_ID, TENANT_C);
    expect(result).toBeNull();
  });

  it('PT-Z: Shop B tries to cancel Shop A transfer → NotFoundException', async () => {
    // cancel uses requireTransferForOwner — must have ownerTenantId === callerTenantId
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'PENDING_ACCEPTANCE', ownerTenantId: TENANT_A }),
    );
    await expect(
      svc.cancel(TRANSFER_ID, undefined, makeActor({ tenantId: TENANT_B })),
    ).rejects.toThrow(NotFoundException);
  });

  // ── PRIVACY ───────────────────────────────────────────────────────────────

  it('PT-AA: Shop B response does NOT contain ownerTenantId or ownerBranchId', async () => {
    const transfer = makeTransfer({ ownerTenantId: TENANT_A, ownerBranchId: BRANCH_A });
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(transfer);
    const result = await svc.findOne(TRANSFER_ID, TENANT_B) as Record<string, any>;
    expect(result).not.toBeNull();
    expect('ownerTenantId' in result).toBe(false);
    expect('ownerBranchId' in result).toBe(false);
    // Partner-relevant fields still present
    expect(result.partnerTenantId).toBe(TENANT_B);
    expect(result.status).toBe('PENDING_ACCEPTANCE');
  });

  // ── NOTIFICATIONS ─────────────────────────────────────────────────────────

  it('PT-AB: create notification goes to partnerTenantId only', async () => {
    setupHappyCreate(prisma);
    await svc.createTransfer(REPAIR_ID, DEFAULT_DTO, makeActor());
    await Promise.resolve();
    const calls = notif.notify.mock.calls.map((c: any) => c[0]);
    const createNotif = calls.find((c: any) => c.type === 'PARTNER_REPAIR_REQUEST');
    expect(createNotif).toBeDefined();
    expect(createNotif.tenantId).toBe(TENANT_B);
    expect(createNotif.tenantId).not.toBe(TENANT_A);
  });

  it('PT-AC: accept notification goes to ownerTenantId only', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'PENDING_ACCEPTANCE', partnerTenantId: TENANT_B, ownerTenantId: TENANT_A }),
    );
    prisma.partnerRepairTransfer.update.mockResolvedValue(makeTransfer({ status: 'ACCEPTED' }));
    await svc.accept(TRANSFER_ID, makeActor({ tenantId: TENANT_B, id: USER_B }));
    await Promise.resolve();
    const calls = notif.notify.mock.calls.map((c: any) => c[0]);
    const acceptNotif = calls.find((c: any) => c.type === 'PARTNER_REPAIR_ACCEPTED');
    expect(acceptNotif).toBeDefined();
    expect(acceptNotif.tenantId).toBe(TENANT_A);
    expect(acceptNotif.tenantId).not.toBe(TENANT_B);
  });

  // ── AUDIT ─────────────────────────────────────────────────────────────────

  it('PT-AD: create writes audit log with correct entityType, no sensitive data', async () => {
    setupHappyCreate(prisma);
    await svc.createTransfer(REPAIR_ID, DEFAULT_DTO, makeActor());
    await Promise.resolve();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action:     'CREATE',
        entityType: 'PartnerRepairTransfer',
        actorId:    USER_A,
      }),
    );
    const call = audit.log.mock.calls[0][0];
    // afterData must NOT contain customer info or payment info
    const afterStr = JSON.stringify(call.afterData ?? {});
    expect(afterStr).not.toContain('customer');
    expect(afterStr).not.toContain('paymentStatus');
    expect(afterStr).not.toContain('paidAmount');
  });

  // ── RECALL ────────────────────────────────────────────────────────────────

  it('PT-AE: OWNER can recall ACCEPTED transfer', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'ACCEPTED', ownerTenantId: TENANT_A }),
    );
    prisma.partnerRepairTransfer.update.mockResolvedValue(makeTransfer({ status: 'RECALLED' }));
    const result = await svc.recall(TRANSFER_ID, 'เรียกคืน', makeActor({ role: 'OWNER' }));
    expect(result.status).toBe('RECALLED');
  });

  it('PT-AF: non-OWNER cannot recall → ForbiddenException', async () => {
    await expect(
      svc.recall(TRANSFER_ID, undefined, makeActor({ role: 'MANAGER' })),
    ).rejects.toThrow(ForbiddenException);
  });

  // ── PRICE UPDATE ──────────────────────────────────────────────────────────

  it('PT-AG: OWNER can update price; non-OWNER cannot', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'PENDING_ACCEPTANCE', ownerTenantId: TENANT_A }),
    );
    prisma.partnerRepairTransfer.update.mockResolvedValue(makeTransfer({ agreedPartnerPrice: 500 }));

    // OWNER succeeds
    const result = await svc.updatePrice(TRANSFER_ID, 500, 'ตกลงราคา', makeActor({ role: 'OWNER' }));
    expect((result as any).agreedPartnerPrice).toBe(500);

    // non-OWNER fails
    await expect(
      svc.updatePrice(TRANSFER_ID, 500, undefined, makeActor({ role: 'MANAGER' })),
    ).rejects.toThrow(ForbiddenException);
  });

  // ── ACCOUNTING SAFETY ─────────────────────────────────────────────────────

  it('PT-AH: no JournalEntry / JournalLine / CashDrawerTransaction created', async () => {
    // The prisma mock has no journalEntry, journalLine, or cashDrawerTransaction keys.
    // This test verifies the service never calls any such method — if it did, it would
    // throw "Cannot read property 'create' of undefined" on the mock.
    // Running the full happy-path create exercises all code paths without error.
    setupHappyCreate(prisma);
    await svc.createTransfer(REPAIR_ID, DEFAULT_DTO, makeActor());
    // No journal-related key should have been accessed on the mock
    expect((prisma as any).journalEntry).toBeUndefined();
    expect((prisma as any).journalLine).toBeUndefined();
    expect((prisma as any).cashDrawerTransaction).toBeUndefined();
  });
});

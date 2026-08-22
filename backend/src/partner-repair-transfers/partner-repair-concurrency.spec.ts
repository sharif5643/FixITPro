/**
 * Phase 4D.3 — Partner Repair Concurrency & Resilience Tests
 *
 * CT-01a: createTransfer — DB P2002 on create → ConflictException (concurrent race window)
 * CT-01b: createTransfer — findFirst pre-flight catches sequential duplicate
 * CT-01c: createTransfer — first caller succeeds (no conflict)
 *
 * CT-02a: createQuotation — DB P2002 on create → ConflictException (concurrent race window)
 * CT-02b: createQuotation — findFirst pre-flight catches sequential duplicate
 * CT-02c: createQuotation — first caller succeeds
 *
 * CT-03a: accept — second caller reads ACCEPTED status → assertTransition → ConflictException
 * CT-03b: reject after first accept changed status → ConflictException
 * CT-03c: first accept call succeeds normally
 *
 * CT-04a: counterQuotation — second counter sees quotation not PENDING → ConflictException
 * CT-04b: acceptQuotation after counter — quotation status COUNTER_OFFER → ConflictException
 *
 * CT-05a: cancel after accept — ACCEPTED→CANCELLED not in VALID_TRANSITIONS → ConflictException
 * CT-05b: accept after cancel — CANCELLED→ACCEPTED not in VALID_TRANSITIONS → ConflictException
 * CT-05c: cancel first wins, accept is then blocked (sequential race resolution)
 *
 * CT-06a: returnDevice when transfer is IN_PROGRESS — IN_PROGRESS→DEVICE_RETURNED invalid
 * CT-06b: complete when already COMPLETED — COMPLETED→COMPLETED invalid
 *
 * DUP-01a: createTransfer P2002 → ConflictException (DB constraint is the last safety net)
 * DUP-01b: createTransfer non-P2002 DB error → re-thrown unchanged
 *
 * DUP-02a: createQuotation P2002 → ConflictException
 * DUP-02b: createQuotation non-P2002 DB error → re-thrown unchanged
 *
 * RETRY-01a: retry createTransfer after success → ConflictException (pre-flight catches)
 * RETRY-01b: retry accept after success → ConflictException (assertTransition catches)
 * RETRY-01c: retry updatePrice (idempotent) → succeeds
 *
 * NOTIF-01a: notify throws on createTransfer → service still returns transfer
 * NOTIF-01b: notify throws on accept → service still returns updated transfer
 * NOTIF-01c: notify rejects with timeout → service still returns
 *
 * AUDIT-01a: auditLog throws on createTransfer → service still returns transfer
 * AUDIT-01b: auditLog throws on complete → service still returns
 * AUDIT-01c: auditLog rejects on ownerReceived → service still returns
 *
 * TENANT-01a: third-tenant blocked from accept (requireTransferForPartner)
 * TENANT-01b: third-tenant blocked from cancel (requireTransferForOwner)
 * TENANT-01c: third-tenant gets null from findOne (isolation)
 *
 * PERM-01a: non-OWNER role cannot recall → ForbiddenException
 * PERM-01b: non-OWNER role cannot updatePrice → ForbiddenException
 *
 * ISP-01a: OWNER_RECEIVED is terminal — any subsequent transition → ConflictException
 * ISP-01b: REJECTED is terminal — accept/cancel/any → ConflictException
 * ISP-01c: RECALLED is terminal — any transition → ConflictException
 */

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PartnerRepairTransfersService }   from './partner-repair-transfers.service';
import { PartnerRepairQuotationsService }   from '../partner-repair-quotations/partner-repair-quotations.service';

// ── Constants ──────────────────────────────────────────────────────────────────

const TENANT_A    = 'tenant-a';
const TENANT_B    = 'tenant-b';
const TENANT_C    = 'tenant-c';
const USER_A      = 'user-a';
const USER_B      = 'user-b';
const USER_C      = 'user-c';
const BRANCH_A    = 'branch-a';
const REPAIR_ID   = 'repair-001';
const REL_ID      = 'rel-001';
const TRANSFER_ID = 'transfer-001';
const QUOTATION_ID = 'quot-001';

// ── Factories ──────────────────────────────────────────────────────────────────

function makeRepair(overrides: Record<string, any> = {}) {
  return {
    id: REPAIR_ID, ticketNumber: 'R-001',
    deviceBrand: 'Apple', deviceModel: 'iPhone 15', deviceColor: 'Black',
    deviceImei: null, issue: 'Screen crack', status: 'IN_PROGRESS', note: null,
    branchId: BRANCH_A,
    branch: { id: BRANCH_A, name: 'Shop A', tenantId: TENANT_A },
    ...overrides,
  };
}

function makeRelationship(overrides: Record<string, any> = {}) {
  return {
    id: REL_ID, status: 'ACCEPTED',
    initiatorTenantId: TENANT_A, partnerTenantId: TENANT_B,
    ...overrides,
  };
}

function makeTransfer(overrides: Record<string, any> = {}) {
  return {
    id: TRANSFER_ID, status: 'PENDING_ACCEPTANCE',
    agreedPartnerPrice: null, pricingNote: null,
    sharedDeviceInfo: null, sharedImageUrls: null,
    partnerWorkNote: null, partnerPartsNote: null,
    sentAt: new Date(), acceptedAt: null, rejectedAt: null, rejectionNote: null,
    deviceReceivedAt: null, partnerStartedAt: null, completedAt: null, completionNote: null,
    returnedAt: null, ownerReceivedAt: null, cancelledAt: null, cancellationNote: null,
    recalledAt: null, recallNote: null, createdAt: new Date(), updatedAt: new Date(),
    repairId: REPAIR_ID, relationshipId: REL_ID,
    ownerTenantId: TENANT_A, ownerBranchId: BRANCH_A,
    partnerTenantId: TENANT_B, partnerBranchId: null,
    sentById: USER_A, acceptedById: null, rejectedById: null, receivedById: null,
    partnerStartedById: null, completedById: null, returnedById: null,
    ownerReceivedById: null, cancelledById: null, recalledById: null,
    ...overrides,
  };
}

function makeQuotation(overrides: Record<string, any> = {}) {
  return {
    id: QUOTATION_ID, version: 1, status: 'PENDING',
    proposedAmount: 800, currency: 'THB', note: null,
    respondedAt: null, expiresAt: null, createdAt: new Date(), updatedAt: new Date(),
    transferId: TRANSFER_ID,
    proposedByTenantId: TENANT_B, proposedByUserId: USER_B,
    respondedByUserId: null,
    transfer: { id: TRANSFER_ID, status: 'DEVICE_RECEIVED', ownerTenantId: TENANT_A, partnerTenantId: TENANT_B },
    ...overrides,
  };
}

function actorA(overrides: Record<string, any> = {}) {
  return { id: USER_A, name: 'Owner A', role: 'OWNER', tenantId: TENANT_A, branchId: BRANCH_A, ...overrides };
}

function actorB(overrides: Record<string, any> = {}) {
  return { id: USER_B, name: 'Partner B', role: 'OWNER', tenantId: TENANT_B, branchId: null, ...overrides };
}

function actorC(overrides: Record<string, any> = {}) {
  return { id: USER_C, name: 'Third C', role: 'OWNER', tenantId: TENANT_C, branchId: null, ...overrides };
}

// ── Mock builders ──────────────────────────────────────────────────────────────

function makeTransferPrisma() {
  return {
    repair:                    { findUnique:  jest.fn() },
    partnerRelationship:       { findUnique:  jest.fn() },
    partnerRepairTransfer:     {
      findUnique: jest.fn(),
      findFirst:  jest.fn(),
      findMany:   jest.fn().mockResolvedValue([]),
      create:     jest.fn(),
      update:     jest.fn(),
    },
    partnerRepairTransferEvent: { create: jest.fn().mockResolvedValue({}) },
  };
}

function makeQuotationPrisma() {
  return {
    partnerRepairTransfer:    { findUnique: jest.fn(), update: jest.fn() },
    partnerRepairQuotation:   {
      create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(),
      findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn(), count: jest.fn(),
    },
    partnerRepairQuotationEvent: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn() },
    $transaction: jest.fn(),
  };
}

function makeAudit() { return { log: jest.fn().mockResolvedValue(undefined) }; }
function makeNotif() { return { notify: jest.fn().mockResolvedValue(undefined) }; }

function makeTransferSvc(prisma: any, audit = makeAudit(), notif = makeNotif()) {
  return new PartnerRepairTransfersService(prisma as any, audit as any, notif as any);
}

function makeQuotationSvc(prisma: any, audit = makeAudit(), notif = makeNotif()) {
  return new PartnerRepairQuotationsService(prisma as any, audit as any, notif as any);
}

const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
const p2025 = Object.assign(new Error('Record not found'), { code: 'P2025' });

// ── Helper: set up happy-path create preconditions ─────────────────────────────

function setupTransferCreate(prisma: any) {
  prisma.repair.findUnique.mockResolvedValue(makeRepair());
  prisma.partnerRelationship.findUnique.mockResolvedValue(makeRelationship());
  prisma.partnerRepairTransfer.findFirst.mockResolvedValue(null);
  prisma.partnerRepairTransfer.create.mockResolvedValue(makeTransfer());
}

// =============================================================================
// CT-01 — Concurrent Transfer Creation
// =============================================================================

describe('CT-01: Concurrent Transfer Creation', () => {
  let prisma: ReturnType<typeof makeTransferPrisma>;
  let svc:   PartnerRepairTransfersService;

  beforeEach(() => {
    prisma = makeTransferPrisma();
    svc    = makeTransferSvc(prisma);
  });

  it('CT-01a: DB P2002 on create → ConflictException (race window after findFirst)', async () => {
    prisma.repair.findUnique.mockResolvedValue(makeRepair());
    prisma.partnerRelationship.findUnique.mockResolvedValue(makeRelationship());
    prisma.partnerRepairTransfer.findFirst.mockResolvedValue(null);
    prisma.partnerRepairTransfer.create.mockRejectedValue(p2002);

    await expect(
      svc.createTransfer(REPAIR_ID, { partnerTenantId: TENANT_B, relationshipId: REL_ID }, actorA()),
    ).rejects.toThrow(ConflictException);
  });

  it('CT-01b: findFirst pre-flight catches sequential duplicate → ConflictException', async () => {
    prisma.repair.findUnique.mockResolvedValue(makeRepair());
    prisma.partnerRelationship.findUnique.mockResolvedValue(makeRelationship());
    prisma.partnerRepairTransfer.findFirst.mockResolvedValue(makeTransfer({ status: 'ACCEPTED' }));

    await expect(
      svc.createTransfer(REPAIR_ID, { partnerTenantId: TENANT_B, relationshipId: REL_ID }, actorA()),
    ).rejects.toThrow(ConflictException);
    expect(prisma.partnerRepairTransfer.create).not.toHaveBeenCalled();
  });

  it('CT-01c: first caller succeeds when no conflict exists', async () => {
    setupTransferCreate(prisma);
    const result = await svc.createTransfer(
      REPAIR_ID,
      { partnerTenantId: TENANT_B, relationshipId: REL_ID },
      actorA(),
    );
    expect(result).toMatchObject({ id: TRANSFER_ID, status: 'PENDING_ACCEPTANCE' });
  });
});

// =============================================================================
// CT-02 — Concurrent Quotation Creation
// =============================================================================

describe('CT-02: Concurrent Quotation Creation', () => {
  let prisma: ReturnType<typeof makeQuotationPrisma>;
  let svc:   PartnerRepairQuotationsService;

  beforeEach(() => {
    prisma = makeQuotationPrisma();
    svc    = makeQuotationSvc(prisma);
  });

  it('CT-02a: DB P2002 on quotation create → ConflictException (race window after findFirst)', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeQuotation().transfer,
    );
    prisma.partnerRepairQuotation.findFirst.mockResolvedValue(null);
    prisma.partnerRepairQuotation.count.mockResolvedValue(0);
    prisma.partnerRepairQuotation.create.mockRejectedValue(p2002);

    await expect(
      svc.createQuotation(TRANSFER_ID, { amount: 500 }, actorB()),
    ).rejects.toThrow(ConflictException);
  });

  it('CT-02b: findFirst pre-flight catches sequential duplicate → ConflictException', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeQuotation().transfer);
    prisma.partnerRepairQuotation.findFirst.mockResolvedValue(makeQuotation());

    await expect(
      svc.createQuotation(TRANSFER_ID, { amount: 500 }, actorB()),
    ).rejects.toThrow(ConflictException);
    expect(prisma.partnerRepairQuotation.create).not.toHaveBeenCalled();
  });

  it('CT-02c: first caller succeeds when no conflict exists', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeQuotation().transfer);
    prisma.partnerRepairQuotation.findFirst.mockResolvedValue(null);
    prisma.partnerRepairQuotation.count.mockResolvedValue(0);
    prisma.partnerRepairQuotation.create.mockResolvedValue(makeQuotation());
    prisma.partnerRepairQuotationEvent.create.mockResolvedValue({});

    const result = await svc.createQuotation(TRANSFER_ID, { amount: 800 }, actorB());
    expect(result).toMatchObject({ id: QUOTATION_ID, status: 'PENDING' });
  });
});

// =============================================================================
// CT-03 — Concurrent Accept (Transfer)
// =============================================================================

describe('CT-03: Concurrent Accept Transfer', () => {
  let prisma: ReturnType<typeof makeTransferPrisma>;
  let svc:   PartnerRepairTransfersService;

  beforeEach(() => {
    prisma = makeTransferPrisma();
    svc    = makeTransferSvc(prisma);
  });

  it('CT-03a: second accept reads already-ACCEPTED status → assertTransition → ConflictException', async () => {
    // Simulate second concurrent caller: reads transfer with status already=ACCEPTED
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'ACCEPTED', partnerTenantId: TENANT_B }),
    );
    await expect(svc.accept(TRANSFER_ID, actorB())).rejects.toThrow(ConflictException);
  });

  it('CT-03b: reject attempt after accept (reads ACCEPTED status) → ConflictException', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'ACCEPTED', partnerTenantId: TENANT_B }),
    );
    await expect(svc.reject(TRANSFER_ID, undefined, actorB())).rejects.toThrow(ConflictException);
  });

  it('CT-03c: first accept on PENDING_ACCEPTANCE succeeds', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'PENDING_ACCEPTANCE', partnerTenantId: TENANT_B }),
    );
    prisma.partnerRepairTransfer.update.mockResolvedValue(makeTransfer({ status: 'ACCEPTED' }));

    const result = await svc.accept(TRANSFER_ID, actorB());
    expect(result).toMatchObject({ status: 'ACCEPTED' });
  });
});

// =============================================================================
// CT-04 — Concurrent Counter (Quotation)
// =============================================================================

describe('CT-04: Concurrent Counter Quotation', () => {
  let prisma: ReturnType<typeof makeQuotationPrisma>;
  let svc:   PartnerRepairQuotationsService;

  beforeEach(() => {
    prisma = makeQuotationPrisma();
    svc    = makeQuotationSvc(prisma);
  });

  it('CT-04a: second counter sees quotation in COUNTER_OFFER (not PENDING) → ConflictException', async () => {
    prisma.partnerRepairQuotation.findUnique.mockResolvedValue(
      makeQuotation({ status: 'COUNTER_OFFER' }),
    );
    await expect(
      svc.counterQuotation(QUOTATION_ID, { amount: 900 }, actorA()),
    ).rejects.toThrow(ConflictException);
  });

  it('CT-04b: accept attempt after counter sees COUNTER_OFFER status → ConflictException', async () => {
    prisma.partnerRepairQuotation.findUnique.mockResolvedValue(
      makeQuotation({ status: 'COUNTER_OFFER' }),
    );
    await expect(svc.acceptQuotation(QUOTATION_ID, actorA())).rejects.toThrow(ConflictException);
  });
});

// =============================================================================
// CT-05 — Accept vs Cancel Race
// =============================================================================

describe('CT-05: Accept vs Cancel Race', () => {
  let prisma: ReturnType<typeof makeTransferPrisma>;
  let svc:   PartnerRepairTransfersService;

  beforeEach(() => {
    prisma = makeTransferPrisma();
    svc    = makeTransferSvc(prisma);
  });

  it('CT-05a: cancel attempt after accept (transfer=ACCEPTED) → ACCEPTED→CANCELLED not valid → ConflictException', async () => {
    // Transfer is already ACCEPTED (first request won the race and set it)
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'ACCEPTED' }),
    );
    await expect(svc.cancel(TRANSFER_ID, undefined, actorA())).rejects.toThrow(ConflictException);
  });

  it('CT-05b: accept attempt after cancel (transfer=CANCELLED) → CANCELLED not in VALID_TRANSITIONS → ConflictException', async () => {
    // Transfer is already CANCELLED (first request cancelled it)
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'CANCELLED', partnerTenantId: TENANT_B }),
    );
    await expect(svc.accept(TRANSFER_ID, actorB())).rejects.toThrow(ConflictException);
  });

  it('CT-05c: accept wins sequentially — cancel is subsequently blocked by state machine', async () => {
    // Step 1: accept wins
    prisma.partnerRepairTransfer.findUnique
      .mockResolvedValueOnce(makeTransfer({ status: 'PENDING_ACCEPTANCE', partnerTenantId: TENANT_B }))
      .mockResolvedValueOnce(makeTransfer({ status: 'ACCEPTED' }));
    prisma.partnerRepairTransfer.update.mockResolvedValueOnce(makeTransfer({ status: 'ACCEPTED' }));
    await svc.accept(TRANSFER_ID, actorB());

    // Step 2: cancel now reads ACCEPTED → ConflictException (cancel not valid from ACCEPTED)
    await expect(svc.cancel(TRANSFER_ID, undefined, actorA())).rejects.toThrow(ConflictException);
  });
});

// =============================================================================
// CT-06 — Complete vs Return Race
// =============================================================================

describe('CT-06: Complete vs Return Race', () => {
  let prisma: ReturnType<typeof makeTransferPrisma>;
  let svc:   PartnerRepairTransfersService;

  beforeEach(() => {
    prisma = makeTransferPrisma();
    svc    = makeTransferSvc(prisma);
  });

  it('CT-06a: returnDevice on IN_PROGRESS (not yet completed) → assertTransition → ConflictException', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'IN_PROGRESS', partnerTenantId: TENANT_B }),
    );
    await expect(svc.returnDevice(TRANSFER_ID, actorB())).rejects.toThrow(ConflictException);
  });

  it('CT-06b: complete when already COMPLETED → COMPLETED→COMPLETED invalid → ConflictException', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'COMPLETED', partnerTenantId: TENANT_B }),
    );
    await expect(svc.complete(TRANSFER_ID, undefined, actorB())).rejects.toThrow(ConflictException);
  });
});

// =============================================================================
// DUP-01 — DB Constraint Transfer
// =============================================================================

describe('DUP-01: DB Constraint Transfer', () => {
  let prisma: ReturnType<typeof makeTransferPrisma>;
  let svc:   PartnerRepairTransfersService;

  beforeEach(() => {
    prisma = makeTransferPrisma();
    svc    = makeTransferSvc(prisma);
  });

  it('DUP-01a: P2002 from create → ConflictException (DB unique partial index is last safety net)', async () => {
    setupTransferCreate(prisma);
    prisma.partnerRepairTransfer.create.mockRejectedValue(p2002);

    await expect(
      svc.createTransfer(REPAIR_ID, { partnerTenantId: TENANT_B, relationshipId: REL_ID }, actorA()),
    ).rejects.toThrow(ConflictException);
  });

  it('DUP-01b: non-P2002 DB error re-throws unchanged', async () => {
    setupTransferCreate(prisma);
    const dbErr = Object.assign(new Error('Connection lost'), { code: 'P1001' });
    prisma.partnerRepairTransfer.create.mockRejectedValue(dbErr);

    await expect(
      svc.createTransfer(REPAIR_ID, { partnerTenantId: TENANT_B, relationshipId: REL_ID }, actorA()),
    ).rejects.toThrow('Connection lost');
  });
});

// =============================================================================
// DUP-02 — DB Constraint Quotation
// =============================================================================

describe('DUP-02: DB Constraint Quotation', () => {
  let prisma: ReturnType<typeof makeQuotationPrisma>;
  let svc:   PartnerRepairQuotationsService;

  beforeEach(() => {
    prisma = makeQuotationPrisma();
    svc    = makeQuotationSvc(prisma);
  });

  it('DUP-02a: P2002 from quotation create → ConflictException', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeQuotation().transfer);
    prisma.partnerRepairQuotation.findFirst.mockResolvedValue(null);
    prisma.partnerRepairQuotation.count.mockResolvedValue(0);
    prisma.partnerRepairQuotation.create.mockRejectedValue(p2002);

    await expect(
      svc.createQuotation(TRANSFER_ID, { amount: 500 }, actorB()),
    ).rejects.toThrow(ConflictException);
  });

  it('DUP-02b: non-P2002 DB error re-throws unchanged', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeQuotation().transfer);
    prisma.partnerRepairQuotation.findFirst.mockResolvedValue(null);
    prisma.partnerRepairQuotation.count.mockResolvedValue(0);
    prisma.partnerRepairQuotation.create.mockRejectedValue(p2025);

    await expect(
      svc.createQuotation(TRANSFER_ID, { amount: 500 }, actorB()),
    ).rejects.toThrow('Record not found');
  });
});

// =============================================================================
// RETRY-01 — Retry Safety
// =============================================================================

describe('RETRY-01: Retry Safety', () => {
  let tPrisma: ReturnType<typeof makeTransferPrisma>;
  let tSvc:   PartnerRepairTransfersService;

  beforeEach(() => {
    tPrisma = makeTransferPrisma();
    tSvc    = makeTransferSvc(tPrisma);
  });

  it('RETRY-01a: retry createTransfer after first succeeds → ConflictException (pre-flight catches)', async () => {
    // Pre-flight now shows an active transfer exists (first call already created it)
    tPrisma.repair.findUnique.mockResolvedValue(makeRepair());
    tPrisma.partnerRelationship.findUnique.mockResolvedValue(makeRelationship());
    tPrisma.partnerRepairTransfer.findFirst.mockResolvedValue(makeTransfer({ status: 'PENDING_ACCEPTANCE' }));

    await expect(
      tSvc.createTransfer(REPAIR_ID, { partnerTenantId: TENANT_B, relationshipId: REL_ID }, actorA()),
    ).rejects.toThrow(ConflictException);
  });

  it('RETRY-01b: retry accept after first accept completed → assertTransition on ACCEPTED → ConflictException', async () => {
    tPrisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'ACCEPTED', partnerTenantId: TENANT_B }),
    );
    await expect(tSvc.accept(TRANSFER_ID, actorB())).rejects.toThrow(ConflictException);
  });

  it('RETRY-01c: retry updatePrice (idempotent) succeeds without conflict', async () => {
    tPrisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'ACCEPTED' }),
    );
    tPrisma.partnerRepairTransfer.update.mockResolvedValue(
      makeTransfer({ status: 'ACCEPTED', agreedPartnerPrice: 500 }),
    );
    const result = await tSvc.updatePrice(TRANSFER_ID, 500, undefined, actorA());
    expect(result).toMatchObject({ agreedPartnerPrice: 500 });
  });
});

// =============================================================================
// NOTIF-01 — Notification Failure Resilience
// =============================================================================

describe('NOTIF-01: Notification Failure Resilience', () => {
  let prisma: ReturnType<typeof makeTransferPrisma>;
  let notif:  { notify: jest.Mock };
  let svc:   PartnerRepairTransfersService;

  beforeEach(() => {
    prisma = makeTransferPrisma();
    notif  = { notify: jest.fn().mockRejectedValue(new Error('Notification service down')) };
    svc    = makeTransferSvc(prisma, makeAudit(), notif);
  });

  it('NOTIF-01a: notify throws on createTransfer → service still returns created transfer', async () => {
    setupTransferCreate(prisma);
    const result = await svc.createTransfer(
      REPAIR_ID, { partnerTenantId: TENANT_B, relationshipId: REL_ID }, actorA(),
    );
    expect(result).toMatchObject({ id: TRANSFER_ID });
  });

  it('NOTIF-01b: notify throws on accept → service still returns updated transfer', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'PENDING_ACCEPTANCE', partnerTenantId: TENANT_B }),
    );
    prisma.partnerRepairTransfer.update.mockResolvedValue(makeTransfer({ status: 'ACCEPTED' }));

    const result = await svc.accept(TRANSFER_ID, actorB());
    expect(result).toMatchObject({ status: 'ACCEPTED' });
  });

  it('NOTIF-01c: notify rejects on ownerReceived → service still returns', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'DEVICE_RETURNED' }),
    );
    prisma.partnerRepairTransfer.update.mockResolvedValue(makeTransfer({ status: 'OWNER_RECEIVED' }));

    const result = await svc.ownerReceived(TRANSFER_ID, actorA());
    expect(result).toMatchObject({ status: 'OWNER_RECEIVED' });
  });
});

// =============================================================================
// AUDIT-01 — AuditLog Failure Resilience
// =============================================================================

describe('AUDIT-01: AuditLog Failure Resilience', () => {
  let prisma: ReturnType<typeof makeTransferPrisma>;
  let audit:  { log: jest.Mock };
  let svc:   PartnerRepairTransfersService;

  beforeEach(() => {
    prisma = makeTransferPrisma();
    audit  = { log: jest.fn().mockRejectedValue(new Error('AuditLog service down')) };
    svc    = makeTransferSvc(prisma, audit);
  });

  it('AUDIT-01a: auditLog throws on createTransfer → service still returns created transfer', async () => {
    setupTransferCreate(prisma);
    const result = await svc.createTransfer(
      REPAIR_ID, { partnerTenantId: TENANT_B, relationshipId: REL_ID }, actorA(),
    );
    expect(result).toMatchObject({ id: TRANSFER_ID });
  });

  it('AUDIT-01b: auditLog throws on complete → service still returns completed transfer', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'IN_PROGRESS', partnerTenantId: TENANT_B }),
    );
    prisma.partnerRepairTransfer.update.mockResolvedValue(makeTransfer({ status: 'COMPLETED' }));

    const result = await svc.complete(TRANSFER_ID, undefined, actorB());
    expect(result).toMatchObject({ status: 'COMPLETED' });
  });

  it('AUDIT-01c: auditLog rejects on recall → service still returns recalled transfer', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'ACCEPTED' }),
    );
    prisma.partnerRepairTransfer.update.mockResolvedValue(makeTransfer({ status: 'RECALLED' }));

    const result = await svc.recall(TRANSFER_ID, undefined, actorA());
    expect(result).toMatchObject({ status: 'RECALLED' });
  });
});

// =============================================================================
// TENANT-01 — Tenant Isolation
// =============================================================================

describe('TENANT-01: Tenant Isolation', () => {
  let prisma: ReturnType<typeof makeTransferPrisma>;
  let svc:   PartnerRepairTransfersService;

  beforeEach(() => {
    prisma = makeTransferPrisma();
    svc    = makeTransferSvc(prisma);
  });

  it('TENANT-01a: third-tenant C blocked from accept (requireTransferForPartner → NotFoundException)', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'PENDING_ACCEPTANCE' }), // ownerTenantId=A, partnerTenantId=B
    );
    await expect(svc.accept(TRANSFER_ID, actorC())).rejects.toThrow(NotFoundException);
  });

  it('TENANT-01b: third-tenant C blocked from cancel (requireTransferForOwner → NotFoundException)', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeTransfer());
    await expect(svc.cancel(TRANSFER_ID, undefined, actorC())).rejects.toThrow(NotFoundException);
  });

  it('TENANT-01c: third-tenant C gets null from findOne (data isolation)', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeTransfer());
    const result = await svc.findOne(TRANSFER_ID, TENANT_C);
    expect(result).toBeNull();
  });
});

// =============================================================================
// PERM-01 — Permission Security
// =============================================================================

describe('PERM-01: Permission Security', () => {
  let prisma: ReturnType<typeof makeTransferPrisma>;
  let svc:   PartnerRepairTransfersService;

  beforeEach(() => {
    prisma = makeTransferPrisma();
    svc    = makeTransferSvc(prisma);
  });

  it('PERM-01a: non-OWNER role cannot recall → ForbiddenException (role check before ownership check)', async () => {
    await expect(
      svc.recall(TRANSFER_ID, undefined, actorA({ role: 'TECHNICIAN' })),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.partnerRepairTransfer.findUnique).not.toHaveBeenCalled();
  });

  it('PERM-01b: non-OWNER role cannot updatePrice → ForbiddenException', async () => {
    await expect(
      svc.updatePrice(TRANSFER_ID, 500, undefined, actorA({ role: 'STAFF' })),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.partnerRepairTransfer.findUnique).not.toHaveBeenCalled();
  });
});

// =============================================================================
// ISP-01 — Invalid State Protection
// =============================================================================

describe('ISP-01: Invalid State Protection', () => {
  let prisma: ReturnType<typeof makeTransferPrisma>;
  let svc:   PartnerRepairTransfersService;

  beforeEach(() => {
    prisma = makeTransferPrisma();
    svc    = makeTransferSvc(prisma);
  });

  it('ISP-01a: OWNER_RECEIVED is terminal — ownerReceived call again → ConflictException', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'OWNER_RECEIVED' }),
    );
    await expect(svc.ownerReceived(TRANSFER_ID, actorA())).rejects.toThrow(ConflictException);
  });

  it('ISP-01b: REJECTED is terminal — accept attempt → ConflictException', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'REJECTED', partnerTenantId: TENANT_B }),
    );
    await expect(svc.accept(TRANSFER_ID, actorB())).rejects.toThrow(ConflictException);
  });

  it('ISP-01c: RECALLED is terminal — deviceReceived attempt → ConflictException', async () => {
    prisma.partnerRepairTransfer.findUnique.mockResolvedValue(
      makeTransfer({ status: 'RECALLED', partnerTenantId: TENANT_B }),
    );
    await expect(svc.deviceReceived(TRANSFER_ID, actorB())).rejects.toThrow(ConflictException);
  });
});

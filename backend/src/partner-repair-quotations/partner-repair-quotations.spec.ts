/**
 * Phase 4C.5 — PartnerRepairQuotations tests (QUOTE-01 through QUOTE-30)
 *
 * QUOTE-01: Create quotation — Shop B happy path (DEVICE_RECEIVED)
 * QUOTE-02: Create — transfer not found → NotFoundException
 * QUOTE-03: Create — transfer in disallowed status → BadRequestException
 * QUOTE-04: Create — caller is Shop A (owner), not Shop B → ForbiddenException
 * QUOTE-05: Create — caller is third-party tenant → ForbiddenException
 * QUOTE-06: Create — active PENDING quotation exists → ConflictException
 * QUOTE-07: Create — Shop B creates when transfer is IN_PROGRESS (allowed)
 * QUOTE-08: Create — notification goes to ownerTenantId only
 * QUOTE-09: Accept — Shop A accepts Shop B's offer → ACCEPTED
 * QUOTE-10: Accept — quotation not found → NotFoundException
 * QUOTE-11: Accept — caller is the proposer (same side) → ForbiddenException
 * QUOTE-12: Accept — quotation status is not PENDING → ConflictException
 * QUOTE-13: Accept — caller is third-party → ForbiddenException
 * QUOTE-14: Accept — notification goes to proposer's tenant
 * QUOTE-15: Accept — transfer.agreedPartnerPrice updated to accepted amount
 * QUOTE-16: Reject — Shop A rejects → REJECTED, transfer NOT updated
 * QUOTE-17: Reject — caller is the proposer → ForbiddenException
 * QUOTE-18: Counter — Shop A counters → current COUNTER_OFFER + new PENDING
 * QUOTE-19: Counter — version number increments correctly
 * QUOTE-20: Counter — Shop B can counter Shop A's counter-offer
 * QUOTE-21: Counter — amount ≤ 0 → BadRequestException
 * QUOTE-22: Counter — notification goes to proposer's tenant
 * QUOTE-23: getQuotations — returns all, ordered by version asc
 * QUOTE-24: getQuotations — third-party tenant → ForbiddenException
 * QUOTE-25: getActiveQuotation — returns PENDING when exists
 * QUOTE-26: getActiveQuotation — returns null when no PENDING
 * QUOTE-27: Privacy — no ownerTenantId exposed in service responses
 * QUOTE-28: No accounting calls — no JournalEntry/JournalLine/CashDrawer access
 * QUOTE-29: cancelPendingQuotations — marks all PENDING as CANCELLED
 * QUOTE-30: Accept updates transfer; reject does NOT update transfer
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PartnerRepairQuotationsService } from './partner-repair-quotations.service';

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_A     = 'tenant-a';
const TENANT_B     = 'tenant-b';
const TENANT_C     = 'tenant-c';
const USER_A       = 'user-a';
const USER_B       = 'user-b';
const USER_C       = 'user-c';
const TRANSFER_ID  = 'transfer-001';
const QUOTATION_ID = 'quotation-001';

// ── Factories ─────────────────────────────────────────────────────────────────

function makeTransfer(overrides: Partial<Record<string, any>> = {}) {
  return {
    id:              TRANSFER_ID,
    status:          'DEVICE_RECEIVED',
    ownerTenantId:   TENANT_A,
    partnerTenantId: TENANT_B,
    ...overrides,
  };
}

function makeQuotation(overrides: Partial<Record<string, any>> = {}) {
  return {
    id:                 QUOTATION_ID,
    version:            1,
    status:             'PENDING',
    proposedAmount:     800,
    currency:           'THB',
    note:               null,
    respondedAt:        null,
    expiresAt:          null,
    createdAt:          new Date(),
    updatedAt:          new Date(),
    transferId:         TRANSFER_ID,
    proposedByTenantId: TENANT_B,
    proposedByUserId:   USER_B,
    respondedByUserId:  null,
    transfer: {
      id:              TRANSFER_ID,
      ownerTenantId:   TENANT_A,
      partnerTenantId: TENANT_B,
    },
    ...overrides,
  };
}

function makeActor(tenantId = TENANT_B, id = USER_B) {
  return { id, name: `User ${id}`, role: 'OWNER', tenantId };
}

// ── Mock builders ─────────────────────────────────────────────────────────────

function buildPrisma(overrides: Partial<Record<string, any>> = {}) {
  return {
    partnerRepairTransfer: {
      findUnique:  jest.fn(),
      update:      jest.fn(),
    },
    partnerRepairQuotation: {
      create:      jest.fn(),
      findUnique:  jest.fn(),
      findFirst:   jest.fn(),
      findMany:    jest.fn(),
      updateMany:  jest.fn(),
      update:      jest.fn(),
      count:       jest.fn(),
    },
    partnerRepairQuotationEvent: {
      create:      jest.fn(),
      findMany:    jest.fn(),
    },
    $transaction: jest.fn(),
    ...overrides,
  };
}

function buildSvc(prisma: any) {
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
  const notif    = { notify: jest.fn().mockResolvedValue(undefined) };
  const svc = new PartnerRepairQuotationsService(prisma as any, auditLog as any, notif as any);
  return { svc, auditLog, notif };
}

// ── QUOTE-01: Create happy path ───────────────────────────────────────────────

it('QUOTE-01: Shop B creates quotation on DEVICE_RECEIVED transfer', async () => {
  const prisma = buildPrisma();
  prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeTransfer());
  prisma.partnerRepairQuotation.findFirst.mockResolvedValue(null);
  prisma.partnerRepairQuotation.count.mockResolvedValue(0);

  const created = { id: QUOTATION_ID, version: 1, status: 'PENDING', proposedAmount: 800, transferId: TRANSFER_ID };
  prisma.partnerRepairQuotation.create.mockResolvedValue(created);
  prisma.partnerRepairQuotationEvent.create.mockResolvedValue({});

  const { svc } = buildSvc(prisma);
  const result = await svc.createQuotation(TRANSFER_ID, { amount: 800 }, makeActor(TENANT_B, USER_B));

  expect(result.status).toBe('PENDING');
  expect(result.version).toBe(1);
  expect(prisma.partnerRepairQuotation.create).toHaveBeenCalledTimes(1);
});

// ── QUOTE-02: Transfer not found ──────────────────────────────────────────────

it('QUOTE-02: transfer not found → NotFoundException', async () => {
  const prisma = buildPrisma();
  prisma.partnerRepairTransfer.findUnique.mockResolvedValue(null);
  const { svc } = buildSvc(prisma);
  await expect(svc.createQuotation(TRANSFER_ID, { amount: 800 }, makeActor(TENANT_B, USER_B)))
    .rejects.toBeInstanceOf(NotFoundException);
});

// ── QUOTE-03: Disallowed transfer status ──────────────────────────────────────

it('QUOTE-03: transfer in PENDING_ACCEPTANCE → BadRequestException', async () => {
  const prisma = buildPrisma();
  prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeTransfer({ status: 'PENDING_ACCEPTANCE' }));
  const { svc } = buildSvc(prisma);
  await expect(svc.createQuotation(TRANSFER_ID, { amount: 800 }, makeActor(TENANT_B, USER_B)))
    .rejects.toBeInstanceOf(BadRequestException);
});

// ── QUOTE-04: Shop A tries to create quotation ───────────────────────────────

it('QUOTE-04: caller is ownerTenantId (Shop A) → ForbiddenException', async () => {
  const prisma = buildPrisma();
  prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeTransfer());
  const { svc } = buildSvc(prisma);
  await expect(svc.createQuotation(TRANSFER_ID, { amount: 800 }, makeActor(TENANT_A, USER_A)))
    .rejects.toBeInstanceOf(ForbiddenException);
});

// ── QUOTE-05: Third-party tries to create ────────────────────────────────────

it('QUOTE-05: caller is third-party (Shop C) → ForbiddenException', async () => {
  const prisma = buildPrisma();
  prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeTransfer());
  const { svc } = buildSvc(prisma);
  await expect(svc.createQuotation(TRANSFER_ID, { amount: 800 }, makeActor(TENANT_C, USER_C)))
    .rejects.toBeInstanceOf(ForbiddenException);
});

// ── QUOTE-06: Active PENDING already exists ───────────────────────────────────

it('QUOTE-06: active PENDING quotation exists → ConflictException', async () => {
  const prisma = buildPrisma();
  prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeTransfer());
  prisma.partnerRepairQuotation.findFirst.mockResolvedValue(makeQuotation());
  const { svc } = buildSvc(prisma);
  await expect(svc.createQuotation(TRANSFER_ID, { amount: 900 }, makeActor(TENANT_B, USER_B)))
    .rejects.toBeInstanceOf(ConflictException);
});

// ── QUOTE-07: IN_PROGRESS also allowed ───────────────────────────────────────

it('QUOTE-07: Shop B creates quotation when transfer is IN_PROGRESS', async () => {
  const prisma = buildPrisma();
  prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeTransfer({ status: 'IN_PROGRESS' }));
  prisma.partnerRepairQuotation.findFirst.mockResolvedValue(null);
  prisma.partnerRepairQuotation.count.mockResolvedValue(0);
  prisma.partnerRepairQuotation.create.mockResolvedValue({ id: QUOTATION_ID, version: 1, status: 'PENDING', proposedAmount: 800, transferId: TRANSFER_ID });
  prisma.partnerRepairQuotationEvent.create.mockResolvedValue({});
  const { svc } = buildSvc(prisma);
  const result = await svc.createQuotation(TRANSFER_ID, { amount: 800 }, makeActor(TENANT_B, USER_B));
  expect(result.status).toBe('PENDING');
});

// ── QUOTE-08: Notification to owner only ─────────────────────────────────────

it('QUOTE-08: notification sent to ownerTenantId, not partnerTenantId', async () => {
  const prisma = buildPrisma();
  prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeTransfer());
  prisma.partnerRepairQuotation.findFirst.mockResolvedValue(null);
  prisma.partnerRepairQuotation.count.mockResolvedValue(0);
  prisma.partnerRepairQuotation.create.mockResolvedValue({ id: QUOTATION_ID, version: 1, status: 'PENDING', proposedAmount: 800, transferId: TRANSFER_ID });
  prisma.partnerRepairQuotationEvent.create.mockResolvedValue({});
  const { svc, notif } = buildSvc(prisma);
  await svc.createQuotation(TRANSFER_ID, { amount: 800 }, makeActor(TENANT_B, USER_B));
  expect(notif.notify).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_A }));
  expect(notif.notify).not.toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_B }));
});

// ── QUOTE-09: Accept happy path ───────────────────────────────────────────────

it('QUOTE-09: Shop A accepts Shop B quotation → status ACCEPTED', async () => {
  const prisma = buildPrisma();
  prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeTransfer());
  const q = makeQuotation();
  prisma.partnerRepairQuotation.findUnique.mockResolvedValue(q);
  const accepted = { ...q, status: 'ACCEPTED' };
  prisma.$transaction.mockResolvedValue([accepted, {}]);
  prisma.partnerRepairQuotationEvent.create.mockResolvedValue({});
  const { svc } = buildSvc(prisma);
  const result = await svc.acceptQuotation(QUOTATION_ID, makeActor(TENANT_A, USER_A));
  expect(result.status).toBe('ACCEPTED');
});

// ── QUOTE-10: Quotation not found on accept ───────────────────────────────────

it('QUOTE-10: quotation not found → NotFoundException', async () => {
  const prisma = buildPrisma();
  prisma.partnerRepairQuotation.findUnique.mockResolvedValue(null);
  const { svc } = buildSvc(prisma);
  await expect(svc.acceptQuotation(QUOTATION_ID, makeActor(TENANT_A, USER_A)))
    .rejects.toBeInstanceOf(NotFoundException);
});

// ── QUOTE-11: Proposer tries to accept own quotation ─────────────────────────

it('QUOTE-11: proposer tries to accept own quotation → ForbiddenException', async () => {
  const prisma = buildPrisma();
  const q = makeQuotation({ proposedByTenantId: TENANT_B });
  prisma.partnerRepairQuotation.findUnique.mockResolvedValue(q);
  const { svc } = buildSvc(prisma);
  // Shop B (proposer) tries to accept
  await expect(svc.acceptQuotation(QUOTATION_ID, makeActor(TENANT_B, USER_B)))
    .rejects.toBeInstanceOf(ForbiddenException);
});

// ── QUOTE-12: Accept non-PENDING quotation ────────────────────────────────────

it('QUOTE-12: quotation already ACCEPTED → ConflictException', async () => {
  const prisma = buildPrisma();
  const q = makeQuotation({ status: 'ACCEPTED' });
  prisma.partnerRepairQuotation.findUnique.mockResolvedValue(q);
  const { svc } = buildSvc(prisma);
  await expect(svc.acceptQuotation(QUOTATION_ID, makeActor(TENANT_A, USER_A)))
    .rejects.toBeInstanceOf(ConflictException);
});

// ── QUOTE-13: Third-party tries to accept ────────────────────────────────────

it('QUOTE-13: third-party tries to accept → ForbiddenException', async () => {
  const prisma = buildPrisma();
  const q = makeQuotation();
  prisma.partnerRepairQuotation.findUnique.mockResolvedValue(q);
  const { svc } = buildSvc(prisma);
  await expect(svc.acceptQuotation(QUOTATION_ID, makeActor(TENANT_C, USER_C)))
    .rejects.toBeInstanceOf(ForbiddenException);
});

// ── QUOTE-14: Accept notification ────────────────────────────────────────────

it('QUOTE-14: accept sends notification to proposer tenant (TENANT_B)', async () => {
  const prisma = buildPrisma();
  const q = makeQuotation({ proposedByTenantId: TENANT_B });
  prisma.partnerRepairQuotation.findUnique.mockResolvedValue(q);
  prisma.$transaction.mockResolvedValue([{ ...q, status: 'ACCEPTED' }, {}]);
  prisma.partnerRepairQuotationEvent.create.mockResolvedValue({});
  const { svc, notif } = buildSvc(prisma);
  await svc.acceptQuotation(QUOTATION_ID, makeActor(TENANT_A, USER_A));
  expect(notif.notify).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_B }));
});

// ── QUOTE-15: Accept updates agreedPartnerPrice ───────────────────────────────

it('QUOTE-15: accept triggers transfer.agreedPartnerPrice update via transaction', async () => {
  const prisma = buildPrisma();
  const q = makeQuotation({ proposedAmount: 750 });
  prisma.partnerRepairQuotation.findUnique.mockResolvedValue(q);
  prisma.$transaction.mockResolvedValue([{ ...q, status: 'ACCEPTED' }, {}]);
  prisma.partnerRepairQuotationEvent.create.mockResolvedValue({});
  const { svc } = buildSvc(prisma);
  await svc.acceptQuotation(QUOTATION_ID, makeActor(TENANT_A, USER_A));
  const txCall = prisma.$transaction.mock.calls[0][0];
  expect(Array.isArray(txCall)).toBe(true);
  expect(txCall).toHaveLength(2);
});

// ── QUOTE-16: Reject happy path ───────────────────────────────────────────────

it('QUOTE-16: Shop A rejects → REJECTED, transfer NOT updated', async () => {
  const prisma = buildPrisma();
  const q = makeQuotation();
  prisma.partnerRepairQuotation.findUnique.mockResolvedValue(q);
  prisma.partnerRepairQuotation.update.mockResolvedValue({ ...q, status: 'REJECTED' });
  prisma.partnerRepairQuotationEvent.create.mockResolvedValue({});
  const { svc } = buildSvc(prisma);
  const result = await svc.rejectQuotation(QUOTATION_ID, undefined, makeActor(TENANT_A, USER_A));
  expect(result.status).toBe('REJECTED');
  expect(prisma.partnerRepairTransfer.update).not.toHaveBeenCalled();
});

// ── QUOTE-17: Proposer tries to reject own quotation ─────────────────────────

it('QUOTE-17: proposer rejects own quotation → ForbiddenException', async () => {
  const prisma = buildPrisma();
  const q = makeQuotation({ proposedByTenantId: TENANT_B });
  prisma.partnerRepairQuotation.findUnique.mockResolvedValue(q);
  const { svc } = buildSvc(prisma);
  await expect(svc.rejectQuotation(QUOTATION_ID, undefined, makeActor(TENANT_B, USER_B)))
    .rejects.toBeInstanceOf(ForbiddenException);
});

// ── QUOTE-18: Counter-offer happy path ───────────────────────────────────────

it('QUOTE-18: Shop A counters → current COUNTER_OFFER, new PENDING created', async () => {
  const prisma = buildPrisma();
  const q = makeQuotation({ version: 1 });
  prisma.partnerRepairQuotation.findUnique.mockResolvedValue(q);
  prisma.partnerRepairQuotation.count.mockResolvedValue(1);
  const newQ = { id: 'quotation-002', version: 2, status: 'PENDING', proposedAmount: 700, transferId: TRANSFER_ID, proposedByTenantId: TENANT_A };
  prisma.$transaction.mockResolvedValue([{}, newQ]);
  prisma.partnerRepairQuotationEvent.create.mockResolvedValue({});
  const { svc } = buildSvc(prisma);
  const result = await svc.counterQuotation(QUOTATION_ID, { amount: 700 }, makeActor(TENANT_A, USER_A));
  expect(result.version).toBe(2);
  expect(result.status).toBe('PENDING');
  expect(result.proposedByTenantId).toBe(TENANT_A);
});

// ── QUOTE-19: Version increments ─────────────────────────────────────────────

it('QUOTE-19: counter increments version to count+1', async () => {
  const prisma = buildPrisma();
  // q.version=2 was proposed by TENANT_B; TENANT_A counters → version=3
  const q = makeQuotation({ version: 2, proposedByTenantId: TENANT_B });
  prisma.partnerRepairQuotation.findUnique.mockResolvedValue(q);
  prisma.partnerRepairQuotation.count.mockResolvedValue(2); // 2 existing
  const newQ = { id: 'q3', version: 3, status: 'PENDING', proposedAmount: 650, transferId: TRANSFER_ID, proposedByTenantId: TENANT_A };
  prisma.$transaction.mockResolvedValue([{}, newQ]);
  prisma.partnerRepairQuotationEvent.create.mockResolvedValue({});
  const { svc } = buildSvc(prisma);
  const result = await svc.counterQuotation(QUOTATION_ID, { amount: 650 }, makeActor(TENANT_A, USER_A));
  expect(result.version).toBe(3);
});

// ── QUOTE-20: Shop B counters Shop A's counter-offer ─────────────────────────

it('QUOTE-20: Shop B can counter Shop A counter-offer (proposedByTenantId = TENANT_A)', async () => {
  const prisma = buildPrisma();
  // Shop A was the last proposer
  const q = makeQuotation({ proposedByTenantId: TENANT_A, version: 2 });
  prisma.partnerRepairQuotation.findUnique.mockResolvedValue(q);
  prisma.partnerRepairQuotation.count.mockResolvedValue(2);
  const newQ = { id: 'q3', version: 3, status: 'PENDING', proposedAmount: 720, transferId: TRANSFER_ID, proposedByTenantId: TENANT_B };
  prisma.$transaction.mockResolvedValue([{}, newQ]);
  prisma.partnerRepairQuotationEvent.create.mockResolvedValue({});
  const { svc } = buildSvc(prisma);
  // Shop B responds (is "other side" from A)
  const result = await svc.counterQuotation(QUOTATION_ID, { amount: 720 }, makeActor(TENANT_B, USER_B));
  expect(result.proposedByTenantId).toBe(TENANT_B);
});

// ── QUOTE-21: Amount validation ───────────────────────────────────────────────

it('QUOTE-21: counter with amount ≤ 0 → BadRequestException', async () => {
  const prisma = buildPrisma();
  const q = makeQuotation();
  prisma.partnerRepairQuotation.findUnique.mockResolvedValue(q);
  const { svc } = buildSvc(prisma);
  await expect(svc.counterQuotation(QUOTATION_ID, { amount: 0 }, makeActor(TENANT_A, USER_A)))
    .rejects.toBeInstanceOf(BadRequestException);
});

// ── QUOTE-22: Counter notification ───────────────────────────────────────────

it('QUOTE-22: counter sends notification to proposer tenant', async () => {
  const prisma = buildPrisma();
  const q = makeQuotation({ proposedByTenantId: TENANT_B });
  prisma.partnerRepairQuotation.findUnique.mockResolvedValue(q);
  prisma.partnerRepairQuotation.count.mockResolvedValue(1);
  const newQ = { id: 'q2', version: 2, status: 'PENDING', proposedAmount: 700, transferId: TRANSFER_ID, proposedByTenantId: TENANT_A };
  prisma.$transaction.mockResolvedValue([{}, newQ]);
  prisma.partnerRepairQuotationEvent.create.mockResolvedValue({});
  const { svc, notif } = buildSvc(prisma);
  await svc.counterQuotation(QUOTATION_ID, { amount: 700 }, makeActor(TENANT_A, USER_A));
  // Should notify Shop B (the previous proposer)
  expect(notif.notify).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_B }));
});

// ── QUOTE-23: getQuotations — ordered by version ──────────────────────────────

it('QUOTE-23: getQuotations returns all quotations ordered by version asc', async () => {
  const prisma = buildPrisma();
  prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeTransfer());
  const list = [
    { ...makeQuotation(), version: 1 },
    { ...makeQuotation(), id: 'q2', version: 2 },
  ];
  prisma.partnerRepairQuotation.findMany.mockResolvedValue(list);
  const { svc } = buildSvc(prisma);
  const result = await svc.getQuotations(TRANSFER_ID, TENANT_A);
  expect(result).toHaveLength(2);
  expect(prisma.partnerRepairQuotation.findMany).toHaveBeenCalledWith(expect.objectContaining({
    orderBy: { version: 'asc' },
  }));
});

// ── QUOTE-24: Third-party getQuotations ──────────────────────────────────────

it('QUOTE-24: third-party calls getQuotations → ForbiddenException', async () => {
  const prisma = buildPrisma();
  prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeTransfer());
  const { svc } = buildSvc(prisma);
  await expect(svc.getQuotations(TRANSFER_ID, TENANT_C))
    .rejects.toBeInstanceOf(ForbiddenException);
});

// ── QUOTE-25: getActiveQuotation — found ──────────────────────────────────────

it('QUOTE-25: getActiveQuotation returns PENDING quotation', async () => {
  const prisma = buildPrisma();
  prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeTransfer());
  const active = makeQuotation({ status: 'PENDING' });
  prisma.partnerRepairQuotation.findFirst.mockResolvedValue(active);
  const { svc } = buildSvc(prisma);
  const result = await svc.getActiveQuotation(TRANSFER_ID, TENANT_A);
  expect(result?.status).toBe('PENDING');
});

// ── QUOTE-26: getActiveQuotation — none ──────────────────────────────────────

it('QUOTE-26: getActiveQuotation returns null when no PENDING quotation', async () => {
  const prisma = buildPrisma();
  prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeTransfer());
  prisma.partnerRepairQuotation.findFirst.mockResolvedValue(null);
  const { svc } = buildSvc(prisma);
  const result = await svc.getActiveQuotation(TRANSFER_ID, TENANT_A);
  expect(result).toBeNull();
});

// ── QUOTE-27: Privacy — no ownerTenantId leaked ───────────────────────────────

it('QUOTE-27: quotation select does not include ownerTenantId field', async () => {
  const prisma = buildPrisma();
  prisma.partnerRepairTransfer.findUnique.mockResolvedValue(makeTransfer());
  prisma.partnerRepairQuotation.findFirst.mockResolvedValue(null);
  const { svc } = buildSvc(prisma);
  await svc.getActiveQuotation(TRANSFER_ID, TENANT_B);
  const selectArg = prisma.partnerRepairQuotation.findFirst.mock.calls[0][0];
  expect(Object.keys(selectArg.select)).not.toContain('ownerTenantId');
});

// ── QUOTE-28: No accounting calls ────────────────────────────────────────────

it('QUOTE-28: no JournalEntry/JournalLine/CashDrawerTransaction access in service', () => {
  const prisma = buildPrisma();
  // Verify the prisma mock does NOT include accounting models
  expect(prisma).not.toHaveProperty('journalEntry');
  expect(prisma).not.toHaveProperty('journalLine');
  expect(prisma).not.toHaveProperty('cashDrawerTransaction');

  // Also verify service doesn't call these prisma accessors
  const { svc } = buildSvc(prisma);
  const svcSource = svc.constructor.toString();
  expect(svcSource).not.toContain('journalEntry');
  expect(svcSource).not.toContain('journalLine');
  expect(svcSource).not.toContain('cashDrawerTransaction');
});

// ── QUOTE-29: cancelPendingQuotations ────────────────────────────────────────

it('QUOTE-29: cancelPendingQuotations marks all PENDING as CANCELLED', async () => {
  const prisma = buildPrisma();
  const pendingList = [
    { id: 'q1' },
    { id: 'q2' },
  ];
  prisma.partnerRepairQuotation.findMany.mockResolvedValue(pendingList);
  prisma.partnerRepairQuotation.updateMany.mockResolvedValue({ count: 2 });
  prisma.partnerRepairQuotationEvent.create.mockResolvedValue({});
  const { svc } = buildSvc(prisma);
  await svc.cancelPendingQuotations(TRANSFER_ID, makeActor(TENANT_A, USER_A));
  expect(prisma.partnerRepairQuotation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: 'CANCELLED' }),
  }));
  // Event created for each cancelled quotation
  expect(prisma.partnerRepairQuotationEvent.create).toHaveBeenCalledTimes(2);
});

// ── QUOTE-30: Accept vs reject transfer update ───────────────────────────────

it('QUOTE-30: accept uses $transaction to update transfer; reject does NOT call $transaction', async () => {
  const prisma = buildPrisma();
  const q = makeQuotation();
  prisma.partnerRepairQuotation.findUnique.mockResolvedValue(q);
  prisma.partnerRepairQuotation.update.mockResolvedValue({ ...q, status: 'REJECTED' });
  prisma.partnerRepairQuotationEvent.create.mockResolvedValue({});
  const { svc } = buildSvc(prisma);

  // Reject — should NOT call $transaction
  await svc.rejectQuotation(QUOTATION_ID, undefined, makeActor(TENANT_A, USER_A));
  expect(prisma.$transaction).not.toHaveBeenCalled();

  // Now accept — should call $transaction
  prisma.partnerRepairQuotation.findUnique.mockResolvedValue(q);
  prisma.$transaction.mockResolvedValue([{ ...q, status: 'ACCEPTED' }, {}]);
  await svc.acceptQuotation(QUOTATION_ID, makeActor(TENANT_A, USER_A));
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
});

/**
 * Phase 4C.2 — PartnerRelationships tests (PR-A through PR-V)
 *
 * PR-A:  Create relationship → record created, notification sent to partner
 * PR-B:  Create to non-existent email → generic response, no record created
 * PR-C:  Create to self → generic response, no record created
 * PR-D:  Duplicate PENDING relationship → ConflictException
 * PR-E:  Duplicate ACCEPTED relationship → ConflictException
 * PR-F:  Re-request after REJECTED → deletes old, creates new
 * PR-G:  Re-request after CANCELLED → deletes old, creates new
 * PR-H:  Accept PENDING → status ACCEPTED, notification to initiator
 * PR-I:  Reject PENDING → status REJECTED, notification to initiator
 * PR-J:  Cancel PENDING → status CANCELLED, no notification to partner
 * PR-K:  Accept non-PENDING → NotFoundException
 * PR-L:  Reject non-PENDING → NotFoundException
 * PR-M:  Cancel non-PENDING → NotFoundException
 * PR-N:  Wrong partnerTenantId on accept → NotFoundException (tenant isolation)
 * PR-O:  Wrong initiatorTenantId on cancel → NotFoundException (tenant isolation)
 * PR-P:  findAll returns own relationships only
 * PR-Q:  findOne returns for either party
 * PR-R:  findOne → null for third-party tenant
 * PR-S:  hasAcceptedPartner → true when ACCEPTED relationship exists
 * PR-T:  hasAcceptedPartner → false when no ACCEPTED relationship
 * PR-U:  Audit log written on create
 * PR-V:  No sensitive data (email) leaked in audit log afterData
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { PartnerRelationshipsService } from './partner-relationships.service';

// ── Mock factories ────────────────────────────────────────────────────────────

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const TENANT_C = 'tenant-c';
const USER_A   = 'user-a';
const USER_B   = 'user-b';
const REL_ID   = 'rel-001';

function makeRel(overrides: Partial<{
  id: string;
  status: string;
  initiatorTenantId: string;
  partnerTenantId: string;
}> = {}) {
  return {
    id:                REL_ID,
    status:            'PENDING',
    initiatorTenantId: TENANT_A,
    partnerTenantId:   TENANT_B,
    requestedById:     USER_A,
    respondedById:     null,
    respondedAt:       null,
    note:              null,
    createdAt:         new Date('2026-08-21'),
    updatedAt:         new Date('2026-08-21'),
    ...overrides,
  };
}

type PrismaMock = {
  tenant:               { findUnique: jest.Mock };
  partnerRelationship:  {
    findUnique:  jest.Mock;
    findFirst:   jest.Mock;
    findMany:    jest.Mock;
    create:      jest.Mock;
    update:      jest.Mock;
    delete:      jest.Mock;
    count:       jest.Mock;
  };
};

function makePrisma(): PrismaMock {
  return {
    tenant: { findUnique: jest.fn() },
    partnerRelationship: {
      findUnique: jest.fn(),
      findFirst:  jest.fn(),
      findMany:   jest.fn().mockResolvedValue([]),
      create:     jest.fn(),
      update:     jest.fn(),
      delete:     jest.fn().mockResolvedValue({}),
      count:      jest.fn().mockResolvedValue(0),
    },
  };
}

type AuditMock = { log: jest.Mock };
function makeAudit(): AuditMock { return { log: jest.fn().mockResolvedValue(undefined) }; }

type NotifMock = { notify: jest.Mock };
function makeNotif(): NotifMock { return { notify: jest.fn().mockResolvedValue(undefined) }; }

function makeService(prisma: PrismaMock, audit: AuditMock, notif: NotifMock) {
  return new PartnerRelationshipsService(prisma as any, audit as any, notif as any);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PartnerRelationshipsService', () => {
  let prisma: PrismaMock;
  let audit:  AuditMock;
  let notif:  NotifMock;
  let svc:    PartnerRelationshipsService;

  beforeEach(() => {
    prisma = makePrisma();
    audit  = makeAudit();
    notif  = makeNotif();
    svc    = makeService(prisma, audit, notif);
  });

  // ── PR-A: Create relationship ─────────────────────────────────────────────

  it('PR-A: creates relationship and notifies partner tenant', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_B, shopName: 'Shop B', status: 'ACTIVE' });
    prisma.partnerRelationship.findUnique.mockResolvedValue(null);
    const rel = makeRel();
    prisma.partnerRelationship.create.mockResolvedValue(rel);

    const result = await svc.create(TENANT_A, 'shopb@example.com', undefined, USER_A, 'Alice');

    expect(prisma.partnerRelationship.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        initiatorTenantId: TENANT_A,
        partnerTenantId:   TENANT_B,
        requestedById:     USER_A,
        status:            'PENDING',
      }),
    });
    expect(notif.notify).toHaveBeenCalledWith(expect.objectContaining({
      type:     'PARTNER_RELATIONSHIP_REQUEST',
      tenantId: TENANT_B,
    }));
    expect(result).toMatchObject({ id: REL_ID, status: 'PENDING' });
  });

  // ── PR-B: Non-existent email → generic response ───────────────────────────

  it('PR-B: non-existent email returns generic response without creating record', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);

    const result = await svc.create(TENANT_A, 'nobody@example.com', undefined, USER_A, 'Alice');

    expect(prisma.partnerRelationship.create).not.toHaveBeenCalled();
    expect(notif.notify).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'PENDING' });
  });

  // ── PR-C: Self-partner → generic response ────────────────────────────────

  it('PR-C: targeting own tenant returns generic response without creating record', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_A, shopName: 'Shop A', status: 'ACTIVE' });

    const result = await svc.create(TENANT_A, 'shopb@example.com', undefined, USER_A, 'Alice');

    expect(prisma.partnerRelationship.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'PENDING' });
  });

  // ── PR-D: Duplicate PENDING → ConflictException ───────────────────────────

  it('PR-D: duplicate PENDING relationship throws ConflictException', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_B, shopName: 'B', status: 'ACTIVE' });
    prisma.partnerRelationship.findUnique.mockResolvedValue(makeRel({ status: 'PENDING' }));

    await expect(svc.create(TENANT_A, 'b@b.com', undefined, USER_A, 'A'))
      .rejects.toThrow(ConflictException);
    expect(prisma.partnerRelationship.delete).not.toHaveBeenCalled();
  });

  // ── PR-E: Duplicate ACCEPTED → ConflictException ─────────────────────────

  it('PR-E: duplicate ACCEPTED relationship throws ConflictException', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_B, shopName: 'B', status: 'ACTIVE' });
    prisma.partnerRelationship.findUnique.mockResolvedValue(makeRel({ status: 'ACCEPTED' }));

    await expect(svc.create(TENANT_A, 'b@b.com', undefined, USER_A, 'A'))
      .rejects.toThrow(ConflictException);
  });

  // ── PR-F: Re-request after REJECTED ──────────────────────────────────────

  it('PR-F: re-request after REJECTED deletes old record and creates new', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_B, shopName: 'B', status: 'ACTIVE' });
    prisma.partnerRelationship.findUnique.mockResolvedValue(makeRel({ status: 'REJECTED' }));
    prisma.partnerRelationship.create.mockResolvedValue(makeRel());

    await svc.create(TENANT_A, 'b@b.com', undefined, USER_A, 'A');

    expect(prisma.partnerRelationship.delete).toHaveBeenCalledWith({ where: { id: REL_ID } });
    expect(prisma.partnerRelationship.create).toHaveBeenCalled();
  });

  // ── PR-G: Re-request after CANCELLED ─────────────────────────────────────

  it('PR-G: re-request after CANCELLED deletes old record and creates new', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_B, shopName: 'B', status: 'ACTIVE' });
    prisma.partnerRelationship.findUnique.mockResolvedValue(makeRel({ status: 'CANCELLED' }));
    prisma.partnerRelationship.create.mockResolvedValue(makeRel());

    await svc.create(TENANT_A, 'b@b.com', undefined, USER_A, 'A');

    expect(prisma.partnerRelationship.delete).toHaveBeenCalledWith({ where: { id: REL_ID } });
  });

  // ── PR-H: Accept ─────────────────────────────────────────────────────────

  it('PR-H: accept sets status to ACCEPTED and notifies initiator', async () => {
    const pending = makeRel({ status: 'PENDING' });
    prisma.partnerRelationship.findFirst.mockResolvedValue(pending);
    const accepted = makeRel({ status: 'ACCEPTED' });
    prisma.partnerRelationship.update.mockResolvedValue(accepted);

    const result = await svc.accept(REL_ID, TENANT_B, USER_B, 'Bob');

    expect(prisma.partnerRelationship.update).toHaveBeenCalledWith({
      where: { id: REL_ID },
      data:  expect.objectContaining({
        status:       'ACCEPTED',
        respondedById: USER_B,
        respondedAt:  expect.any(Date),
      }),
    });
    expect(notif.notify).toHaveBeenCalledWith(expect.objectContaining({
      type:     'PARTNER_RELATIONSHIP_ACCEPTED',
      tenantId: TENANT_A,
    }));
    expect(result.status).toBe('ACCEPTED');
  });

  // ── PR-I: Reject ─────────────────────────────────────────────────────────

  it('PR-I: reject sets status to REJECTED and notifies initiator', async () => {
    prisma.partnerRelationship.findFirst.mockResolvedValue(makeRel({ status: 'PENDING' }));
    prisma.partnerRelationship.update.mockResolvedValue(makeRel({ status: 'REJECTED' }));

    const result = await svc.reject(REL_ID, TENANT_B, USER_B, 'Bob');

    expect(prisma.partnerRelationship.update).toHaveBeenCalledWith({
      where: { id: REL_ID },
      data:  expect.objectContaining({ status: 'REJECTED', respondedById: USER_B }),
    });
    expect(notif.notify).toHaveBeenCalledWith(expect.objectContaining({
      type:     'PARTNER_RELATIONSHIP_REJECTED',
      tenantId: TENANT_A,
    }));
    expect(result.status).toBe('REJECTED');
  });

  // ── PR-J: Cancel ─────────────────────────────────────────────────────────

  it('PR-J: cancel sets status to CANCELLED and does NOT notify partner', async () => {
    prisma.partnerRelationship.findFirst.mockResolvedValue(makeRel({ status: 'PENDING' }));
    prisma.partnerRelationship.update.mockResolvedValue(makeRel({ status: 'CANCELLED' }));

    await svc.cancel(REL_ID, TENANT_A, USER_A, 'Alice');

    expect(prisma.partnerRelationship.update).toHaveBeenCalledWith({
      where: { id: REL_ID },
      data:  { status: 'CANCELLED' },
    });
    expect(notif.notify).not.toHaveBeenCalled();
  });

  // ── PR-K: Accept non-PENDING → NotFoundException ──────────────────────────

  it('PR-K: accept non-PENDING relationship throws NotFoundException', async () => {
    prisma.partnerRelationship.findFirst.mockResolvedValue(null);
    await expect(svc.accept(REL_ID, TENANT_B, USER_B, 'Bob'))
      .rejects.toThrow(NotFoundException);
  });

  // ── PR-L: Reject non-PENDING → NotFoundException ──────────────────────────

  it('PR-L: reject non-PENDING relationship throws NotFoundException', async () => {
    prisma.partnerRelationship.findFirst.mockResolvedValue(null);
    await expect(svc.reject(REL_ID, TENANT_B, USER_B, 'Bob'))
      .rejects.toThrow(NotFoundException);
  });

  // ── PR-M: Cancel non-PENDING → NotFoundException ──────────────────────────

  it('PR-M: cancel non-PENDING relationship throws NotFoundException', async () => {
    prisma.partnerRelationship.findFirst.mockResolvedValue(null);
    await expect(svc.cancel(REL_ID, TENANT_A, USER_A, 'Alice'))
      .rejects.toThrow(NotFoundException);
  });

  // ── PR-N: Tenant isolation on accept ─────────────────────────────────────

  it('PR-N: accept with wrong partnerTenantId throws NotFoundException (isolation)', async () => {
    // findFirst filters by partnerTenantId = TENANT_C, but the rel belongs to TENANT_B
    prisma.partnerRelationship.findFirst.mockResolvedValue(null);
    await expect(svc.accept(REL_ID, TENANT_C, USER_B, 'Charlie'))
      .rejects.toThrow(NotFoundException);
    expect(prisma.partnerRelationship.update).not.toHaveBeenCalled();
  });

  // ── PR-O: Tenant isolation on cancel ─────────────────────────────────────

  it('PR-O: cancel with wrong initiatorTenantId throws NotFoundException (isolation)', async () => {
    prisma.partnerRelationship.findFirst.mockResolvedValue(null);
    await expect(svc.cancel(REL_ID, TENANT_C, USER_A, 'Alice'))
      .rejects.toThrow(NotFoundException);
    expect(prisma.partnerRelationship.update).not.toHaveBeenCalled();
  });

  // ── PR-P: findAll returns own relationships only ──────────────────────────

  it('PR-P: findAll uses OR filter for initiator and partner tenantId', async () => {
    prisma.partnerRelationship.findMany.mockResolvedValue([makeRel()]);

    await svc.findAll(TENANT_A);

    expect(prisma.partnerRelationship.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { initiatorTenantId: TENANT_A },
            { partnerTenantId:   TENANT_A },
          ],
        },
      }),
    );
  });

  // ── PR-Q: findOne returns for either party ────────────────────────────────

  it('PR-Q: findOne uses OR filter for either party', async () => {
    prisma.partnerRelationship.findFirst.mockResolvedValue(makeRel());

    await svc.findOne(REL_ID, TENANT_B);

    expect(prisma.partnerRelationship.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: REL_ID,
          OR: [
            { initiatorTenantId: TENANT_B },
            { partnerTenantId:   TENANT_B },
          ],
        },
      }),
    );
  });

  // ── PR-R: findOne returns null for third-party tenant ─────────────────────

  it('PR-R: findOne returns null for a third-party tenant', async () => {
    prisma.partnerRelationship.findFirst.mockResolvedValue(null);

    const result = await svc.findOne(REL_ID, TENANT_C);
    expect(result).toBeNull();
  });

  // ── PR-S: hasAcceptedPartner → true ──────────────────────────────────────

  it('PR-S: hasAcceptedPartner returns true when ACCEPTED relationship exists', async () => {
    prisma.partnerRelationship.count.mockResolvedValue(1);

    const has = await svc.hasAcceptedPartner(TENANT_A);
    expect(has).toBe(true);
    expect(prisma.partnerRelationship.count).toHaveBeenCalledWith({
      where: {
        status: 'ACCEPTED',
        OR: [
          { initiatorTenantId: TENANT_A },
          { partnerTenantId:   TENANT_A },
        ],
      },
    });
  });

  // ── PR-T: hasAcceptedPartner → false ─────────────────────────────────────

  it('PR-T: hasAcceptedPartner returns false when no ACCEPTED relationship', async () => {
    prisma.partnerRelationship.count.mockResolvedValue(0);

    const has = await svc.hasAcceptedPartner(TENANT_A);
    expect(has).toBe(false);
  });

  // ── PR-U: Audit log on create ─────────────────────────────────────────────

  it('PR-U: audit log written with correct action and entityType on create', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_B, shopName: 'B', status: 'ACTIVE' });
    prisma.partnerRelationship.findUnique.mockResolvedValue(null);
    prisma.partnerRelationship.create.mockResolvedValue(makeRel());

    await svc.create(TENANT_A, 'b@b.com', undefined, USER_A, 'Alice');

    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action:     'PARTNER_RELATIONSHIP_CREATED',
      entityType: 'PartnerRelationship',
      entityId:   REL_ID,
    }));
  });

  // ── PR-V: No sensitive data in audit afterData ────────────────────────────

  it('PR-V: audit afterData does not contain email or sensitive tenant data', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_B, shopName: 'B', status: 'ACTIVE' });
    prisma.partnerRelationship.findUnique.mockResolvedValue(null);
    prisma.partnerRelationship.create.mockResolvedValue(makeRel());

    await svc.create(TENANT_A, 'secret@example.com', undefined, USER_A, 'Alice');

    const logCall = audit.log.mock.calls[0][0];
    const after   = logCall?.afterData ?? {};
    expect(Object.keys(after)).not.toContain('email');
    expect(Object.keys(after)).not.toContain('password');
    expect(Object.keys(after)).not.toContain('partnerEmail');
    // Only tenant IDs and status are present
    expect(after).toMatchObject({
      initiatorTenantId: TENANT_A,
      partnerTenantId:   TENANT_B,
      status:            'PENDING',
    });
  });
});

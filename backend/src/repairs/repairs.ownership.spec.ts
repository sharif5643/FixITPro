import { ForbiddenException } from '@nestjs/common';
import { RepairsService } from './repairs.service';

function svc(
  repair: { technicianId: string | null; technician?: { name: string } | null } | null,
  madeTechnician: string[] = [],
) {
  const prisma: any = {
    repair: { findFirst: jest.fn().mockResolvedValue(repair) },
    rolePermission: { findMany: jest.fn().mockResolvedValue([]) },
    // user.count answers "is this user a technician" (personal repair.technician grant)
    user: { count: jest.fn(async ({ where }: any) => (madeTechnician.includes(where.id) ? 1 : 0)) },
  };
  return new (RepairsService as any)(prisma, {}, {}, {}, {}, {}, {}) as RepairsService;
}
const tech = (id: string) => ({ id, role: 'TECHNICIAN' });

describe('technicians work only on their own jobs', () => {
  it('owners, managers and cashiers who are not technicians are not limited', async () => {
    const s = svc({ technicianId: 'other', technician: { name: 'B' } });
    for (const role of ['OWNER', 'MANAGER', 'CASHIER']) {
      await expect(s.assertCanWorkOn('r1', { id: 'u1', role }, 't1')).resolves.toBeUndefined();
    }
  });

  it('a technician edits their own job, and may hand it back', async () => {
    const s = svc({ technicianId: 'a', technician: { name: 'A' } });
    await expect(s.assertCanWorkOn('r1', tech('a'), 't1')).resolves.toBeUndefined();
    await expect(s.assertCanWorkOn('r1', tech('a'), 't1', { technicianId: null })).resolves.toBeUndefined();
  });

  it('a technician cannot give their job to someone else', async () => {
    const s = svc({ technicianId: 'a', technician: { name: 'A' } });
    await expect(s.assertCanWorkOn('r1', tech('a'), 't1', { technicianId: 'b' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a job with no technician can be taken, but not worked on before taking it', async () => {
    const s = svc({ technicianId: null, technician: null });
    await expect(s.assertCanWorkOn('r1', tech('a'), 't1', { technicianId: 'a' })).resolves.toBeUndefined();
    await expect(s.assertCanWorkOn('r1', tech('a'), 't1')).rejects.toThrow('รับงานนี้');
    await expect(s.assertCanWorkOn('r1', tech('a'), 't1', { technicianId: 'b' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("another technician's job is read-only, and cannot be taken over", async () => {
    const s = svc({ technicianId: 'b', technician: { name: 'สมชาย' } });
    await expect(s.assertCanWorkOn('r1', tech('a'), 't1')).rejects.toThrow('สมชาย');
    await expect(s.assertCanWorkOn('r1', tech('a'), 't1', { technicianId: 'a' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a cashier the owner made a technician follows the technician rules', async () => {
    const s = svc({ technicianId: 'b', technician: { name: 'สมชาย' } }, ['c']);
    await expect(s.assertCanWorkOn('r1', { id: 'c', role: 'CASHIER' }, 't1')).rejects.toThrow('สมชาย');
    const own = svc({ technicianId: 'c', technician: { name: 'C' } }, ['c']);
    await expect(own.assertCanWorkOn('r1', { id: 'c', role: 'CASHIER' }, 't1')).resolves.toBeUndefined();
  });

  it('a manager who is also a technician can still change any job', async () => {
    const s = svc({ technicianId: 'b', technician: { name: 'สมชาย' } }, ['m']);
    await expect(s.assertCanWorkOn('r1', { id: 'm', role: 'MANAGER' }, 't1')).resolves.toBeUndefined();
  });
});

import { ForbiddenException } from '@nestjs/common';
import { RepairsService } from './repairs.service';

function svc(repair: { technicianId: string | null; technician?: { name: string } | null } | null) {
  const prisma: any = { repair: { findFirst: jest.fn().mockResolvedValue(repair) } };
  return new (RepairsService as any)(prisma, {}, {}, {}, {}, {}, {}) as RepairsService;
}
const tech = (id: string) => ({ id, role: 'TECHNICIAN' });

describe('technicians work only on their own jobs', () => {
  it('owners, managers and cashiers are not limited', async () => {
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
});

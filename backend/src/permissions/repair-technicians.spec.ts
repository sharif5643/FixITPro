import { repairTechnicianWhere } from './repair-technicians';

function reader(byRole: Record<string, string[]>) {
  return {
    rolePermission: {
      findMany: jest.fn(async ({ where }: any) => (byRole[where.role] ?? []).map((permission) => ({ permission }))),
    },
  } as any;
}

describe('who does repair work', () => {
  it('technicians, plus people given repair.technician personally', async () => {
    const w = await repairTechnicianWhere(reader({ MANAGER: ['repair.edit'] }), 't1');
    expect(w.OR).toEqual([
      { role: { in: ['TECHNICIAN'] } },
      { userPermissions: { some: { permission: 'repair.technician' } } },
    ]);
  });

  it('a whole role the shop gave repair.technician (e.g. managers who also repair)', async () => {
    const w = await repairTechnicianWhere(reader({ MANAGER: ['repair.edit', 'repair.technician'] }), 't1');
    expect(w.OR[0]).toEqual({ role: { in: ['TECHNICIAN', 'MANAGER'] } });
  });
});

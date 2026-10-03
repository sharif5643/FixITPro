import { TenantRestoreService } from './tenant-restore.service';

describe('Restore waits for a finished safety snapshot', () => {
  const svcWith = (statuses: string[]) => {
    let i = 0;
    const backupSvc = { getJob: jest.fn(() => ({ status: statuses[Math.min(i++, statuses.length - 1)], error: 'disk full' })) };
    const svc = Object.create(TenantRestoreService.prototype) as TenantRestoreService;
    (svc as any).backupSvc = backupSvc;
    return svc;
  };

  it('continues once the snapshot succeeds', async () => {
    await expect(svcWith(['RUNNING', 'SUCCESS']).waitForSafetySnapshot('b1', 50, 1)).resolves.toBeUndefined();
  });

  it('stops when the snapshot fails', async () => {
    await expect(svcWith(['FAILED']).waitForSafetySnapshot('b1', 50, 1)).rejects.toThrow('failed');
  });

  it('stops (and touches no data) when the snapshot is still running at the limit', async () => {
    await expect(svcWith(['RUNNING']).waitForSafetySnapshot('b1', 20, 1)).rejects.toThrow('did not finish in time');
  });
});

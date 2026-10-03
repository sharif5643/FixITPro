import { BackupService } from './backup.service';

describe('BackupService catch-up after a missed nightly run', () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
  const make = (files: { filename: string; modifiedAt: Date }[]) => {
    const svc = Object.create(BackupService.prototype) as BackupService;
    (svc as any).logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
    jest.spyOn(svc, 'listBackups').mockResolvedValue(files as any);
    const run = jest.spyOn(svc, 'scheduledBackup').mockResolvedValue(undefined);
    return { svc, run };
  };

  it('backs up when the newest database backup is older than 26 hours', async () => {
    const { svc, run } = make([
      { filename: 'fixitpro_old.sql', modifiedAt: hoursAgo(31) },
      { filename: 'uploads_fixitpro_new.tar.gz', modifiedAt: hoursAgo(1) }, // not a DB backup
    ]);
    await expect(svc.catchUpBackup()).resolves.toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('backs up when there is no backup at all', async () => {
    const { svc, run } = make([]);
    await expect(svc.catchUpBackup()).resolves.toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does nothing when last night\'s backup exists', async () => {
    const { svc, run } = make([{ filename: 'fixitpro_recent.sql', modifiedAt: hoursAgo(10) }]);
    await expect(svc.catchUpBackup()).resolves.toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});

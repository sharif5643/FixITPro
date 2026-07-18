/**
 * Unit tests for BackupS3Service (RC2-003 Part C).
 *
 * AWS SDK is fully mocked — no real network calls are made.
 * Tests cover:
 *   - isEnabled flag
 *   - missing configuration rejection
 *   - successful upload + verification
 *   - size mismatch detection
 *   - credentials NEVER appear in logs
 *   - failed upload throws (so caller can keep local file)
 *   - retention: always keeps at least minKeep objects
 *   - retention: does not delete the latest valid backup
 */

import { BackupS3Service } from './backup-s3.service';
import { Logger } from '@nestjs/common';

// ── Mock @aws-sdk/client-s3 ───────────────────────────────────────────────────
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client:              jest.fn().mockImplementation(() => ({ send: mockSend })),
    PutObjectCommand:      jest.fn().mockImplementation((i) => ({ _type: 'Put',  ...i })),
    HeadObjectCommand:     jest.fn().mockImplementation((i) => ({ _type: 'Head', ...i })),
    ListObjectsV2Command:  jest.fn().mockImplementation((i) => ({ _type: 'List', ...i })),
    DeleteObjectCommand:   jest.fn().mockImplementation((i) => ({ _type: 'Del',  ...i })),
  };
});

// ── Mock fs ───────────────────────────────────────────────────────────────────
jest.mock('fs', () => ({
  statSync:          jest.fn().mockReturnValue({ size: 1024 }),
  createReadStream:  jest.fn().mockReturnValue('STREAM'),
}));

import * as fs from 'fs';

// ── Helpers ───────────────────────────────────────────────────────────────────
const STRONG_ACCESS_KEY = 'ACCESS_KEY_ID';
const STRONG_SECRET_KEY = 'SECRET_ACCESS_KEY_VALUE';

function setS3Env(overrides: Record<string, string | undefined> = {}) {
  process.env.BACKUP_S3_ENABLED           = 'true';
  process.env.BACKUP_S3_BUCKET            = 'test-bucket';
  process.env.BACKUP_S3_ACCESS_KEY_ID     = STRONG_ACCESS_KEY;
  process.env.BACKUP_S3_SECRET_ACCESS_KEY = STRONG_SECRET_KEY;
  process.env.BACKUP_S3_REGION            = 'us-east-1';
  process.env.BACKUP_S3_PREFIX            = 'backups/';
  delete process.env.BACKUP_S3_ENDPOINT;
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function clearS3Env() {
  for (const key of [
    'BACKUP_S3_ENABLED', 'BACKUP_S3_BUCKET', 'BACKUP_S3_ACCESS_KEY_ID',
    'BACKUP_S3_SECRET_ACCESS_KEY', 'BACKUP_S3_REGION', 'BACKUP_S3_PREFIX', 'BACKUP_S3_ENDPOINT',
  ]) {
    delete process.env[key];
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('BackupS3Service', () => {
  let service: BackupS3Service;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockSend.mockReset();
    (fs.statSync as jest.Mock).mockReturnValue({ size: 1024 });
    service   = new BackupS3Service();
    logSpy   = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    clearS3Env();
    jest.restoreAllMocks();
  });

  // ── isEnabled ──────────────────────────────────────────────────────────────
  describe('isEnabled', () => {
    it('returns false when BACKUP_S3_ENABLED is not set', () => {
      delete process.env.BACKUP_S3_ENABLED;
      expect(service.isEnabled).toBe(false);
    });

    it('returns false when BACKUP_S3_ENABLED=false', () => {
      process.env.BACKUP_S3_ENABLED = 'false';
      expect(service.isEnabled).toBe(false);
    });

    it('returns true when BACKUP_S3_ENABLED=true', () => {
      process.env.BACKUP_S3_ENABLED = 'true';
      expect(service.isEnabled).toBe(true);
    });
  });

  // ── Missing configuration ──────────────────────────────────────────────────
  describe('upload — missing configuration', () => {
    it('throws when BACKUP_S3_ACCESS_KEY_ID is missing', async () => {
      setS3Env({ BACKUP_S3_ACCESS_KEY_ID: undefined });
      await expect(service.upload('/tmp/test.sql', 'test.sql')).rejects.toThrow(
        /BACKUP_S3_ACCESS_KEY_ID is not configured/,
      );
    });

    it('throws when BACKUP_S3_SECRET_ACCESS_KEY is missing', async () => {
      setS3Env({ BACKUP_S3_SECRET_ACCESS_KEY: undefined });
      await expect(service.upload('/tmp/test.sql', 'test.sql')).rejects.toThrow(
        /BACKUP_S3_SECRET_ACCESS_KEY is not configured/,
      );
    });

    it('throws when BACKUP_S3_BUCKET is missing', async () => {
      setS3Env({ BACKUP_S3_BUCKET: undefined });
      await expect(service.upload('/tmp/test.sql', 'test.sql')).rejects.toThrow(
        /BACKUP_S3_BUCKET is not configured/,
      );
    });
  });

  // ── Successful upload ──────────────────────────────────────────────────────
  describe('upload — success', () => {
    beforeEach(() => setS3Env());

    it('calls PutObjectCommand then HeadObjectCommand', async () => {
      mockSend.mockResolvedValueOnce({}) // PutObject
               .mockResolvedValueOnce({ ContentLength: 1024, ETag: '"abc123"' }); // HeadObject

      await service.upload('/app/backups/fixitpro.sql', 'fixitpro.sql');

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('returns key and size on success', async () => {
      mockSend.mockResolvedValueOnce({})
               .mockResolvedValueOnce({ ContentLength: 1024, ETag: '"abc123"' });

      const result = await service.upload('/app/backups/fixitpro.sql', 'fixitpro.sql');

      expect(result.key).toBe('backups/fixitpro.sql');
      expect(result.size).toBe(1024);
    });

    it('throws when remote ContentLength does not match local size', async () => {
      mockSend.mockResolvedValueOnce({})
               .mockResolvedValueOnce({ ContentLength: 999, ETag: '"mismatch"' }); // wrong size

      await expect(
        service.upload('/app/backups/fixitpro.sql', 'fixitpro.sql'),
      ).rejects.toThrow(/size mismatch/i);
    });
  });

  // ── Credentials never logged ───────────────────────────────────────────────
  describe('upload — credentials not logged', () => {
    beforeEach(() => setS3Env());

    it('never logs the secret access key', async () => {
      mockSend.mockResolvedValueOnce({})
               .mockResolvedValueOnce({ ContentLength: 1024 });

      await service.upload('/app/backups/fixitpro.sql', 'fixitpro.sql');

      const allLogCalls = logSpy.mock.calls.flat().join(' ');
      expect(allLogCalls).not.toContain(STRONG_SECRET_KEY);
      expect(allLogCalls).not.toContain(STRONG_ACCESS_KEY);
    });

    it('never logs the secret key in error messages', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(
        service.upload('/app/backups/fixitpro.sql', 'fixitpro.sql'),
      ).rejects.toThrow();

      const allErrorCalls = errorSpy.mock.calls.flat().join(' ');
      expect(allErrorCalls).not.toContain(STRONG_SECRET_KEY);
      expect(allErrorCalls).not.toContain(STRONG_ACCESS_KEY);
    });
  });

  // ── Retention ──────────────────────────────────────────────────────────────
  describe('applyRetention', () => {
    beforeEach(() => setS3Env());

    const makeObject = (key: string, daysAgo: number) => ({
      Key:          key,
      LastModified: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
    });

    it('does not delete any objects when there are fewer than minKeep', async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [
          makeObject('backups/b1.sql', 60),
          makeObject('backups/b2.sql', 50),
        ],
      });

      const result = await service.applyRetention(30, 7);

      // Only ListObjectsV2 was called — no DeleteObject calls
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result.deleted).toHaveLength(0);
    });

    it('keeps at least minKeep objects and deletes older ones beyond that', async () => {
      // 10 backups: 8 older than 30 days, 2 recent — minKeep=7
      const contents = [
        makeObject('backups/b01.sql', 90), // oldest — will be deleted (>30d, and beyond the 7-keep window)
        makeObject('backups/b02.sql', 80),
        makeObject('backups/b03.sql', 70),
        makeObject('backups/b04.sql', 60), // will be deleted
        makeObject('backups/b05.sql', 50), // kept — minKeep 7 from the end
        makeObject('backups/b06.sql', 40), // kept
        makeObject('backups/b07.sql', 35), // kept
        makeObject('backups/b08.sql', 25), // kept (not older than 30d)
        makeObject('backups/b09.sql', 15), // kept
        makeObject('backups/b10.sql',  5), // newest — always kept
      ];

      // ListObjects returns all 10; then 3 DeleteObject calls
      mockSend
        .mockResolvedValueOnce({ Contents: contents })
        .mockResolvedValue({});

      const result = await service.applyRetention(30, 7);

      // 10 objects − 7 (minKeep) = 3 eligible; among those 3 (b01,b02,b03), all are >30d old
      expect(result.deleted).toHaveLength(3);
      expect(result.deleted).toContain('backups/b01.sql');
      expect(result.deleted).not.toContain('backups/b04.sql'); // inside the 7-keep window
      expect(result.deleted).not.toContain('backups/b10.sql'); // newest — never deleted
    });

    it('does not delete the latest valid backup', async () => {
      const contents = Array.from({ length: 8 }, (_, i) =>
        makeObject(`backups/b${String(i + 1).padStart(2, '0')}.sql`, 90 - i),
      );
      // All 8 are >30 days old, minKeep=7 → only 1 eligible for deletion (the oldest)

      mockSend
        .mockResolvedValueOnce({ Contents: contents })
        .mockResolvedValue({});

      const result = await service.applyRetention(30, 7);

      expect(result.deleted).toHaveLength(1);
      expect(result.deleted[0]).toBe('backups/b01.sql'); // oldest deleted
      // newest (b08) must NOT be deleted
      expect(result.deleted).not.toContain('backups/b08.sql');
    });
  });
});

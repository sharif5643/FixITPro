import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BackupS3Service } from './backup-s3.service';
import * as path from 'path';
import { backupDir as defaultBackupDir, uploadsBaseDir } from '../common/storage-paths';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir: string;
  private readonly retentionDays: number;

  constructor(
    private auditLog: AuditLogService,
    private notif: NotificationsService,
    private s3: BackupS3Service,
  ) {
    this.backupDir    = defaultBackupDir;
    this.retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS ?? '30', 10);
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  // Runs every day at 02:00 AM (server local time)
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async scheduledBackup() {
    this.logger.log('[Scheduled] Daily backup starting…');
    try {
      const result = await this.createBackup('system', 'Scheduled Task');
      this.logger.log(`[Scheduled] Backup complete: ${result.filename} (${result.sizeFormatted})`);
      await this.purgeOldBackups();
    } catch (err) {
      this.logger.error('[Scheduled] Daily backup failed', (err as Error).message);
    }
  }

  // Delete backups older than retentionDays, keeping at least 7 regardless
  async purgeOldBackups(): Promise<{ deleted: string[]; kept: number }> {
    const files = await this.listBackups();
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    const MIN_KEEP = 7;
    const deleted: string[] = [];

    for (let i = MIN_KEEP; i < files.length; i++) {
      if (files[i].createdAt.getTime() < cutoff) {
        const filePath = path.join(this.backupDir, files[i].filename);
        try {
          await fsPromises.unlink(filePath);
          deleted.push(files[i].filename);
          this.logger.log(`[Retention] Deleted old backup: ${files[i].filename}`);
        } catch (err) {
          this.logger.warn(`[Retention] Could not delete ${files[i].filename}: ${(err as Error).message}`);
        }
      }
    }

    return { deleted, kept: files.length - deleted.length };
  }

  private async findPgDump(): Promise<string | null> {
    const candidates = ['pg_dump'];
    for (const candidate of candidates) {
      try {
        await execAsync(`${candidate} --version`);
        return candidate;
      } catch {
        // try next candidate
      }
    }
    return null;
  }

  private parseDbUrl(): {
    host: string;
    port: string;
    dbName: string;
    user: string;
    password: string;
  } {
    const dbUrl = process.env.DATABASE_URL ?? '';
    const url = new URL(dbUrl);
    return {
      host:     url.hostname,
      port:     url.port || '5432',
      dbName:   url.pathname.slice(1),
      user:     url.username,
      password: decodeURIComponent(url.password),
    };
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  async getStatus() {
    const pgDumpPath = await this.findPgDump();
    const files = await this.listBackups();
    const lastBackup = files.length > 0 ? files[0] : null;

    return {
      pgDumpAvailable: pgDumpPath !== null,
      backupDir:       this.backupDir,
      backupCount:     files.length,
      lastBackup,
      offsiteEnabled:  this.s3.isEnabled,
    };
  }

  async createBackup(actorId?: string, actorName?: string) {
    const pgDumpPath = await this.findPgDump();
    if (!pgDumpPath) {
      await this.notif.notify({
        type:     'BACKUP_FAILED',
        title:    'Backup ล้มเหลว: ไม่พบ pg_dump',
        message:  'ไม่พบโปรแกรม pg_dump กรุณาติดตั้ง PostgreSQL tools หรือเพิ่ม PATH',
        severity: 'ERROR',
      });
      throw new BadRequestException('pg_dump not found. Install PostgreSQL client tools or add to PATH.');
    }

    const db        = this.parseDbUrl();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename  = `${db.dbName}_${timestamp}.sql`;
    const filePath  = path.join(this.backupDir, filename);

    // ── Step 1: pg_dump ───────────────────────────────────────────────────────
    try {
      const cmd = `${pgDumpPath} -h ${db.host} -p ${db.port} -U ${db.user} -F p -f "${filePath}" ${db.dbName}`;
      this.logger.log(`Running backup: ${cmd.replace(db.password, '***')}`);

      await execAsync(cmd, {
        env: { ...process.env, PGPASSWORD: db.password },
      });
    } catch (err) {
      this.logger.error('pg_dump failed', err);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
      await this.notif.notify({
        type:     'BACKUP_FAILED',
        title:    'Backup ล้มเหลว',
        message:  `pg_dump เกิดข้อผิดพลาด: ${(err as Error).message?.slice(0, 120) ?? 'unknown'}`,
        severity: 'ERROR',
      });
      throw new BadRequestException(`Backup failed: ${(err as Error).message}`);
    }

    // ── Step 2: Verify local file exists and is non-empty ────────────────────
    const stat = await fsPromises.stat(filePath);
    if (stat.size === 0) {
      fs.unlinkSync(filePath);
      await this.notif.notify({
        type:     'BACKUP_FAILED',
        title:    'Backup ล้มเหลว: ไฟล์ว่างเปล่า',
        message:  `pg_dump สร้างไฟล์ว่างเปล่า: ${filename}`,
        severity: 'ERROR',
      });
      throw new BadRequestException(`Backup produced an empty file: ${filename}`);
    }

    // ── Step 3: Audit log + success notification ──────────────────────────────
    await this.auditLog.log({
      actorId,
      actorName,
      action:     'BACKUP_CREATED',
      entityType: 'Backup',
      entityId:   filename,
      afterData:  { filename, sizeBytes: stat.size },
    });

    await this.notif.notify({
      type:     'BACKUP_SUCCESS',
      title:    'Backup สำเร็จ',
      message:  `สร้างไฟล์ ${filename} (${this.formatSize(stat.size)}) เรียบร้อยแล้ว`,
      severity: 'INFO',
    });

    // ── Step 4: Uploads archive (non-fatal) ───────────────────────────────────
    const uploadsArchive = await this.createUploadsArchive(db.dbName, timestamp);

    // ── Step 5: Offsite S3 upload (non-fatal — local backup is always kept) ──
    let s3Result: { key: string; size: number } | null = null;
    if (this.s3.isEnabled) {
      try {
        s3Result = await this.s3.upload(filePath, filename);
        this.logger.log(`[S3] Offsite upload complete: ${s3Result.key}`);

        // Apply S3 retention after a successful upload.
        const s3Retention = await this.s3.applyRetention(this.retentionDays);
        if (s3Retention.deleted.length > 0) {
          this.logger.log(`[S3][Retention] Removed ${s3Retention.deleted.length} old remote backup(s)`);
        }
      } catch (s3Err) {
        // S3 failure must never delete or corrupt the local backup.
        this.logger.error(
          `[S3] Offsite upload failed — local backup at ${filePath} is preserved`,
          (s3Err as Error).message,
        );
        await this.notif.notify({
          type:     'BACKUP_FAILED',
          title:    'Backup offsite ล้มเหลว',
          message:  `อัปโหลด backup ไป S3 ล้มเหลว (local backup ยังปลอดภัย): ${(s3Err as Error).message?.slice(0, 120)}`,
          severity: 'ERROR',
        });
        // Do NOT re-throw — local backup succeeded.
      }
    }

    return {
      filename,
      sizeBytes:     stat.size,
      sizeFormatted: this.formatSize(stat.size),
      createdAt:     stat.birthtime,
      uploadsArchive,
      s3:            s3Result ? { key: s3Result.key, size: s3Result.size } : null,
    };
  }

  private async createUploadsArchive(
    dbName: string,
    timestamp: string,
  ): Promise<{ filename: string; sizeBytes: number; sizeFormatted: string } | null> {
    const archiveFilename = `uploads_${dbName}_${timestamp}.tar.gz`;
    const archivePath = path.join(this.backupDir, archiveFilename);

    try {
      if (!fs.existsSync(uploadsBaseDir)) return null;
      const parentDir = path.dirname(uploadsBaseDir);
      const dirName   = path.basename(uploadsBaseDir);
      await execAsync(`tar -czf "${archivePath}" -C "${parentDir}" "${dirName}"`);
      const stat = await fsPromises.stat(archivePath);
      this.logger.log(`Uploads archive created: ${archiveFilename} (${this.formatSize(stat.size)})`);
      return { filename: archiveFilename, sizeBytes: stat.size, sizeFormatted: this.formatSize(stat.size) };
    } catch (err) {
      this.logger.warn(`Uploads archive skipped (non-fatal): ${(err as Error).message}`);
      if (fs.existsSync(archivePath)) {
        try { fs.unlinkSync(archivePath); } catch { /* ignore */ }
      }
      return null;
    }
  }

  async listBackups() {
    if (!fs.existsSync(this.backupDir)) return [];

    const files = await fsPromises.readdir(this.backupDir);
    const backupFiles = files.filter(
      (f) => f.endsWith('.sql') || f.endsWith('.dump') || f.endsWith('.tar.gz'),
    );

    const stats = await Promise.all(
      backupFiles.map(async (f) => {
        const stat = await fsPromises.stat(path.join(this.backupDir, f));
        return {
          filename:      f,
          sizeBytes:     stat.size,
          sizeFormatted: this.formatSize(stat.size),
          createdAt:     stat.birthtime,
          modifiedAt:    stat.mtime,
        };
      }),
    );

    return stats.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  getBackupFilePath(filename: string): string {
    // Prevent path traversal
    const safe = path.basename(filename);
    if (safe !== filename || !/^[\w\-\.]+$/.test(filename)) {
      throw new BadRequestException('Invalid filename');
    }
    const filePath = path.join(this.backupDir, safe);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Backup file not found');
    }
    return filePath;
  }
}

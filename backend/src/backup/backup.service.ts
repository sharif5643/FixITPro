import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir: string;
  // Keep backups for this many days; files older are purged automatically
  private readonly retentionDays: number;

  constructor(
    private auditLog: AuditLogService,
    private notif: NotificationsService,
  ) {
    this.backupDir =
      process.env.BACKUP_DIR ?? path.join(process.cwd(), '..', 'backups');
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
    const candidates = [
      'pg_dump',
      '"C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe"',
      '"C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe"',
      '"C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe"',
      '"C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe"',
    ];
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

    const db = this.parseDbUrl();
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const filename = `${db.dbName}_${timestamp}.sql`;
    const filePath = path.join(this.backupDir, filename);

    try {
      const cmd = `${pgDumpPath} -h ${db.host} -p ${db.port} -U ${db.user} -F p -f "${filePath}" ${db.dbName}`;
      this.logger.log(`Running backup: ${cmd.replace(db.password, '***')}`);

      await execAsync(cmd, {
        env: { ...process.env, PGPASSWORD: db.password },
      });

      const stat = await fsPromises.stat(filePath);

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

      return {
        filename,
        sizeBytes:     stat.size,
        sizeFormatted: this.formatSize(stat.size),
        createdAt:     stat.birthtime,
      };
    } catch (err) {
      this.logger.error('pg_dump failed', err);
      // Remove partial file
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
      await this.notif.notify({
        type:     'BACKUP_FAILED',
        title:    'Backup ล้มเหลว',
        message:  `เกิดข้อผิดพลาดขณะสร้าง backup: ${(err as Error).message?.slice(0, 120) ?? 'unknown'}`,
        severity: 'ERROR',
      });
      throw new BadRequestException(`Backup failed: ${(err as Error).message}`);
    }
  }

  async listBackups() {
    if (!fs.existsSync(this.backupDir)) return [];

    const files = await fsPromises.readdir(this.backupDir);
    const backupFiles = files.filter(
      (f) => f.endsWith('.sql') || f.endsWith('.dump'),
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

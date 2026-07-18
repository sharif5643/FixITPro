/**
 * RC2-003 Part C: Offsite backup upload to any S3-compatible storage.
 *
 * Supports:
 *   AWS S3           — leave BACKUP_S3_ENDPOINT unset, set BACKUP_S3_REGION
 *   Cloudflare R2    — BACKUP_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
 *   Backblaze B2     — BACKUP_S3_ENDPOINT=https://s3.<region>.backblazeb2.com
 *   MinIO            — BACKUP_S3_ENDPOINT=https://minio.example.com
 *
 * Required env vars when BACKUP_S3_ENABLED=true:
 *   BACKUP_S3_BUCKET
 *   BACKUP_S3_ACCESS_KEY_ID
 *   BACKUP_S3_SECRET_ACCESS_KEY
 *
 * Optional env vars:
 *   BACKUP_S3_ENDPOINT   (omit for AWS S3)
 *   BACKUP_S3_REGION     (default: auto)
 *   BACKUP_S3_PREFIX     (default: backups/)
 *
 * Security: credentials are never included in log output.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import * as fs from 'fs';

interface S3Config {
  endpoint?:       string;
  region:          string;
  bucket:          string;
  prefix:          string;
  accessKeyId:     string;
  secretAccessKey: string;
}

@Injectable()
export class BackupS3Service {
  private readonly logger = new Logger(BackupS3Service.name);

  get isEnabled(): boolean {
    return process.env.BACKUP_S3_ENABLED === 'true';
  }

  private getConfig(): S3Config {
    const accessKeyId     = process.env.BACKUP_S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY;
    const bucket          = process.env.BACKUP_S3_BUCKET;

    if (!accessKeyId)     throw new Error('BACKUP_S3_ACCESS_KEY_ID is not configured');
    if (!secretAccessKey) throw new Error('BACKUP_S3_SECRET_ACCESS_KEY is not configured');
    if (!bucket)          throw new Error('BACKUP_S3_BUCKET is not configured');

    return {
      endpoint:        process.env.BACKUP_S3_ENDPOINT,
      region:          process.env.BACKUP_S3_REGION ?? 'auto',
      bucket,
      prefix:          process.env.BACKUP_S3_PREFIX ?? 'backups/',
      accessKeyId,
      secretAccessKey,
    };
  }

  private createClient(cfg: S3Config): S3Client {
    return new S3Client({
      endpoint:        cfg.endpoint,
      region:          cfg.region,
      credentials:     { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      // MinIO / R2 / B2 require path-style addressing when a custom endpoint is set.
      forcePathStyle:  !!cfg.endpoint,
    });
  }

  /**
   * Uploads a local file to the configured S3-compatible bucket.
   * Verifies the upload by checking ContentLength via a HEAD request.
   * Throws on failure (caller is responsible for keeping the local file).
   */
  async upload(localPath: string, filename: string): Promise<{ key: string; size: number }> {
    const cfg    = this.getConfig();
    const client = this.createClient(cfg);

    const localStat = fs.statSync(localPath);
    const key       = `${cfg.prefix}${filename}`;

    // Never log cfg.accessKeyId or cfg.secretAccessKey
    this.logger.log(
      `[S3] Uploading ${filename} → bucket=${cfg.bucket} key=${key} size=${localStat.size}`,
    );

    await client.send(
      new PutObjectCommand({
        Bucket:        cfg.bucket,
        Key:           key,
        Body:          fs.createReadStream(localPath),
        ContentLength: localStat.size,
      }),
    );

    // Verify upload: remote ContentLength must match local file size.
    const head = await client.send(
      new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }),
    );

    if (head.ContentLength !== localStat.size) {
      throw new Error(
        `[S3] Upload size mismatch for ${key}: ` +
        `remote=${head.ContentLength} local=${localStat.size}`,
      );
    }

    this.logger.log(
      `[S3] Upload verified: ${key} (${head.ContentLength} bytes, ETag=${head.ETag ?? 'n/a'})`,
    );

    return { key, size: localStat.size };
  }

  /**
   * Removes objects from S3 older than retentionDays, keeping at least minKeep.
   * Sorts by LastModified ascending so the oldest are deleted first.
   */
  async applyRetention(
    retentionDays: number,
    minKeep = 7,
  ): Promise<{ deleted: string[] }> {
    const cfg    = this.getConfig();
    const client = this.createClient(cfg);
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const deleted: string[] = [];

    const list = await client.send(
      new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: cfg.prefix }),
    );

    const objects = (list.Contents ?? []).sort(
      (a, b) => (a.LastModified?.getTime() ?? 0) - (b.LastModified?.getTime() ?? 0),
    );

    // Never delete the most-recent minKeep objects regardless of age.
    for (let i = 0; i < Math.max(0, objects.length - minKeep); i++) {
      const obj = objects[i];
      if (obj.Key && obj.LastModified && obj.LastModified.getTime() < cutoff) {
        await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: obj.Key }));
        deleted.push(obj.Key);
        this.logger.log(`[S3][Retention] Deleted ${obj.Key}`);
      }
    }

    return { deleted };
  }
}

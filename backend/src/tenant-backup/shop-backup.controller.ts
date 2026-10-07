import { Controller, Get, NotFoundException, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TenantBackupService } from './tenant-backup.service';

/**
 * The shop owner backs up their own shop and downloads it: every record of this shop as JSON in
 * a .tar.gz (no passwords or tokens). The system admin can restore it. No TenantActiveGuard: an
 * expired shop may still take its data.
 */
@Controller('shop-backups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER')
export class ShopBackupController {
  constructor(private readonly backups: TenantBackupService) {}

  @Get()
  list(@CurrentUser('tenantId') tenantId: string) {
    return this.backups.listTenantJobs(tenantId).slice(0, 20).map((j) => ({
      id: j.id, status: j.status, startedAt: j.startedAt, completedAt: j.completedAt,
      sizeBytes: j.sizeBytes, createdByName: j.createdByName, counts: j.counts?.[tenantId] ?? null,
    }));
  }

  /** Start a backup; while one is running for this shop, that one is returned. */
  @Post()
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    const running = this.backups.listTenantJobs(tenantId).find((j) => j.status === 'RUNNING');
    const job = running ?? await this.backups.startBackup([tenantId], actorId, actorName ?? '');
    return { id: job.id, status: job.status, startedAt: job.startedAt };
  }

  @Get(':id/download')
  download(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string, @Res() res: Response) {
    const job = this.backups.listTenantJobs(tenantId).find((j) => j.id === id);
    if (!job || job.status !== 'SUCCESS') throw new NotFoundException('ไม่พบไฟล์สำรองข้อมูล');
    res.download(this.backups.getArchivePath(id), job.fileName ?? 'shop-backup.tar.gz');
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Res,
  UseGuards,
  HttpCode,
  ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';
import { TenantBackupService } from './tenant-backup.service';
import { TenantRestoreService } from './tenant-restore.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RestoreDestination } from './tenant-backup.types';

function assertSuperAdmin(role: string) {
  if (role !== 'SUPER_ADMIN') {
    throw new ForbiddenException('Tenant backup/restore is only accessible to SUPER_ADMIN');
  }
}

class StartBackupDto {
  tenantIds!: string[];
}

class StartRestoreDto {
  backupJobId!: string;
  destination!: RestoreDestination;
  destinationTenantId!: string;
  confirmed!: boolean; // must be true
}

@Controller('super-admin/backups')
@UseGuards(JwtAuthGuard)
export class TenantBackupController {
  constructor(
    private readonly backupSvc: TenantBackupService,
    private readonly restoreSvc: TenantRestoreService,
  ) {}

  // ── Tenant list (for backup UI) ─────────────────────────────────────────────

  @Get('tenants')
  async getTenants(@CurrentUser('role') role: string) {
    assertSuperAdmin(role);
    return this.backupSvc.listTenants();
  }

  // ── Backup jobs ──────────────────────────────────────────────────────────────

  @Get()
  listBackups(@CurrentUser('role') role: string) {
    assertSuperAdmin(role);
    return this.backupSvc.listJobs();
  }

  @Post()
  @HttpCode(202)
  async createBackup(
    @Body() dto: StartBackupDto,
    @CurrentUser('id')   actorId: string,
    @CurrentUser('name') actorName: string,
    @CurrentUser('role') role: string,
  ) {
    assertSuperAdmin(role);
    return this.backupSvc.startBackup(dto.tenantIds, actorId, actorName);
  }

  @Get(':id')
  getBackup(@Param('id') id: string, @CurrentUser('role') role: string) {
    assertSuperAdmin(role);
    return this.backupSvc.getJob(id);
  }

  @Get(':id/download')
  async downloadBackup(
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser('role') role: string,
  ) {
    assertSuperAdmin(role);
    const filePath = this.backupSvc.getArchivePath(id);
    const job = this.backupSvc.getJob(id);
    res.download(filePath, job.fileName ?? 'backup.tar.gz');
  }

  @Post(':id/validate')
  @HttpCode(200)
  async validateBackup(@Param('id') id: string, @CurrentUser('role') role: string) {
    assertSuperAdmin(role);
    return this.backupSvc.validateArchive(id);
  }

  // ── Restore jobs ─────────────────────────────────────────────────────────────

  @Get('restores/list')
  listRestores(@CurrentUser('role') role: string) {
    assertSuperAdmin(role);
    return this.restoreSvc.listRestoreJobs();
  }

  @Post('restores')
  @HttpCode(202)
  async startRestore(
    @Body() dto: StartRestoreDto,
    @CurrentUser('id')   actorId: string,
    @CurrentUser('name') actorName: string,
    @CurrentUser('role') role: string,
  ) {
    assertSuperAdmin(role);
    return this.restoreSvc.startRestore(
      dto.backupJobId,
      dto.destination,
      dto.destinationTenantId,
      actorId,
      actorName,
      dto.confirmed,
    );
  }

  @Get('restores/:id')
  getRestore(@Param('id') id: string, @CurrentUser('role') role: string) {
    assertSuperAdmin(role);
    return this.restoreSvc.getRestoreJob(id);
  }
}

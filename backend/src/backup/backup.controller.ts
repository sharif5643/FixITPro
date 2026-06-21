import {
  Controller,
  Get,
  Post,
  Param,
  Res,
  UseGuards,
  HttpCode,
  ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

// Backup contains ALL tenants' data — restrict to SUPER_ADMIN only
function assertSuperAdmin(role: string) {
  if (role !== 'SUPER_ADMIN') {
    throw new ForbiddenException(
      'Backup ข้อมูลเป็นฐานข้อมูลทั้งระบบ — เข้าถึงได้เฉพาะ SUPER_ADMIN เท่านั้น',
    );
  }
}

@Controller('backup')
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission('system.backup')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get('status')
  getStatus(@CurrentUser('role') role: string) {
    assertSuperAdmin(role);
    return this.backup.getStatus();
  }

  @Get('list')
  listBackups(@CurrentUser('role') role: string) {
    assertSuperAdmin(role);
    return this.backup.listBackups();
  }

  @Post('create')
  @HttpCode(201)
  createBackup(
    @CurrentUser('id')   actorId: string,
    @CurrentUser('name') actorName: string,
    @CurrentUser('role') role: string,
  ) {
    assertSuperAdmin(role);
    return this.backup.createBackup(actorId, actorName);
  }

  @Post('purge')
  @HttpCode(200)
  purgeOldBackups(@CurrentUser('role') role: string) {
    assertSuperAdmin(role);
    return this.backup.purgeOldBackups();
  }

  @Get('download/:filename')
  async download(
    @Param('filename') filename: string,
    @Res() res: Response,
    @CurrentUser('role') role: string,
  ) {
    assertSuperAdmin(role);
    const filePath = this.backup.getBackupFilePath(filename);
    res.download(filePath, filename);
  }
}

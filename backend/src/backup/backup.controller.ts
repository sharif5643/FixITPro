import {
  Controller,
  Get,
  Post,
  Param,
  Res,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { Response } from 'express';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('backup')
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission('system.backup')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get('status')
  getStatus() {
    return this.backup.getStatus();
  }

  @Get('list')
  listBackups() {
    return this.backup.listBackups();
  }

  @Post('create')
  @HttpCode(201)
  createBackup(
    @CurrentUser('id')   actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.backup.createBackup(actorId, actorName);
  }

  @Post('purge')
  @HttpCode(200)
  purgeOldBackups() {
    return this.backup.purgeOldBackups();
  }

  @Get('download/:filename')
  async download(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const filePath = this.backup.getBackupFilePath(filename);
    res.download(filePath, filename);
  }
}

import {
  Controller, Get, Patch, Post, Body, UseGuards, ForbiddenException,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { uploadsBaseDir } from '../common/storage-paths';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

const LOGO_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/webp': '.webp',
  'image/gif':  '.gif',
};

@UseGuards(JwtAuthGuard, TenantActiveGuard)
@Controller('settings')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  // Lightweight endpoint: only shopName + logoUrl.
  // Used by sidebar/navbar — no settings.manage permission required.
  @Get('shop')
  getShopInfo(@CurrentUser('tenantId') tenantId: string | null) {
    return this.settingsService.getShopInfo(tenantId);
  }

  @Get()
  getSettings(@CurrentUser('tenantId') tenantId: string | null) {
    return this.settingsService.getSettings(tenantId);
  }

  @Post('logo')
  @UseGuards(PermissionGuard)
  @RequirePermission('settings.manage')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: any, _file, cb) => {
          const tenantId = req.user?.tenantId ?? 'shared';
          const dir = join(uploadsBaseDir, tenantId, 'logos');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const unique  = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const safeExt = LOGO_MIME_TO_EXT[file.mimetype] ?? '.jpg';
          cb(null, `${unique}${safeExt}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (LOGO_MIME_TO_EXT[file.mimetype]) cb(null, true);
        else cb(new BadRequestException('รองรับเฉพาะไฟล์รูปภาพ (jpg, png, webp, gif)'), false);
      },
    }),
  )
  uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    if (!file) throw new BadRequestException('ไม่พบไฟล์');
    return { url: `/api/v1/files/${tenantId}/logos/${file.filename}` };
  }

  @Post('reset-data')
  async resetData(@CurrentUser() user: any) {
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('เฉพาะเจ้าของร้านเท่านั้นที่สามารถรีเซ็ตข้อมูลได้');
    }
    await this.settingsService.resetTenantData(user.tenantId);
    return { success: true };
  }

  @Patch()
  @UseGuards(PermissionGuard)
  @RequirePermission('settings.manage')
  updateSettings(
    @Body()                  dto: UpdateSettingsDto,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.settingsService.updateSettings(dto, tenantId, actorId, actorName);
  }
}

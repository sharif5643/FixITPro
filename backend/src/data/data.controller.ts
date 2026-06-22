import {
  Controller, Get, Post, Param, Query, Body,
  UseGuards, UseInterceptors, UploadedFile,
  StreamableFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DataService } from './data.service';

const csvStorage = memoryStorage();

@UseGuards(JwtAuthGuard, TenantActiveGuard, PermissionGuard)
@Controller('data')
export class DataController {
  constructor(private readonly svc: DataService) {}

  // ── Export ──────────────────────────────────────────────────────────────────

  @Get('export/:type')
  @RequirePermission('data.export')
  async export(
    @Param('type') type: string,
    @Query() query: { startDate?: string; endDate?: string },
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    const result = await this.svc.export(type, query, actorId, actorName, tenantId);
    const buffer = Buffer.from(result.content, 'utf-8');
    return new StreamableFile(buffer, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${result.filename}"`,
    });
  }

  // ── Template download ───────────────────────────────────────────────────────

  @Get('template/:type')
  @RequirePermission('data.import')
  getTemplate(@Param('type') type: string) {
    const result = this.svc.getTemplate(type);
    const buffer = Buffer.from(result.content, 'utf-8');
    return new StreamableFile(buffer, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${result.filename}"`,
    });
  }

  // ── Preview import (no DB write) ────────────────────────────────────────────

  @Post('import/:type/preview')
  @RequirePermission('data.import')
  @UseInterceptors(FileInterceptor('file', {
    storage: csvStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ok = file.mimetype.includes('csv') || file.mimetype.includes('text') ||
                 file.originalname.endsWith('.csv');
      cb(ok ? null : new BadRequestException('รองรับเฉพาะไฟล์ CSV'), ok);
    },
  }))
  async previewImport(
    @Param('type') type: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    if (!file) throw new BadRequestException('กรุณาเลือกไฟล์ CSV');
    return this.svc.preview(type, file.buffer.toString('utf-8'), tenantId);
  }

  // ── Execute import ──────────────────────────────────────────────────────────

  @Post('import/:type')
  @RequirePermission('data.import')
  @UseInterceptors(FileInterceptor('file', {
    storage: csvStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ok = file.mimetype.includes('csv') || file.mimetype.includes('text') ||
                 file.originalname.endsWith('.csv');
      cb(ok ? null : new BadRequestException('รองรับเฉพาะไฟล์ CSV'), ok);
    },
  }))
  async executeImport(
    @Param('type') type: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    if (!file) throw new BadRequestException('กรุณาเลือกไฟล์ CSV');
    return this.svc.import(type, file.buffer.toString('utf-8'), actorId, actorName, tenantId);
  }
}

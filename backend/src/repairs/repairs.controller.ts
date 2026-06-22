import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { repairsUploadDir } from '../common/storage-paths';
import { RepairsService } from './repairs.service';
import { CreateRepairDto } from './dto/create-repair.dto';
import { UpdateRepairDto } from './dto/update-repair.dto';
import { AddRepairPartDto } from './dto/add-repair-part.dto';
import { RepairPaymentDto } from './dto/repair-payment.dto';
import { ReversePaymentDto } from './dto/reverse-payment.dto';
import { AdditionalPaymentDto } from './dto/additional-payment.dto';
import { RepairQcDto } from './dto/repair-qc.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { ModuleGuard } from '../common/guards/module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

const UPLOADS_DIR = repairsUploadDir;
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

// M-4 FIX: whitelist of allowed image extensions (lowercase).
const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// M-4 FIX: derive safe extension from MIME type rather than original filename
// so a file named "shell.jpg.php" cannot smuggle in a .php extension.
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/webp': '.webp',
  'image/gif':  '.gif',
};

const imageStorage = diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const unique  = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeExt = MIME_TO_EXT[file.mimetype] ?? '.jpg';
    cb(null, `${unique}${safeExt}`);
  },
});

@RequireModule('repair')
@UseGuards(JwtAuthGuard, TenantActiveGuard, ModuleGuard)
@Controller('repairs')
export class RepairsController {
  constructor(private repairsService: RepairsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('repair.create')
  create(
    @Body() dto: CreateRepairDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
    @CurrentUser('role') role: string,
    @CurrentUser('branchId') jwtBranchId: string | null,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    // SUPER_ADMIN without a tenant context must use /super-admin/* endpoints
    if (role === 'SUPER_ADMIN' && !tenantId) {
      throw new ForbiddenException('Super Admin ต้องเข้าข้อมูลผ่าน /super-admin/* เท่านั้น');
    }
    // OWNER/SUPER_ADMIN have no fixed branch in JWT — use the branchId they send in the body
    const isElevated = role === 'OWNER' || role === 'SUPER_ADMIN';
    const branchId   = isElevated ? (dto.branchId ?? jwtBranchId ?? undefined) : (jwtBranchId ?? undefined);
    return this.repairsService.create(dto, actorId, actorName, branchId, tenantId);
  }

  @Get()
  findAll(
    @Query() query: { status?: string; customerId?: string; date?: string; branchId?: string; activeOnly?: string },
    @CurrentUser('role') role: string,
    @CurrentUser('branchId') userBranchId: string | null,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    // SUPER_ADMIN without tenant context must use /super-admin/* endpoints
    if (role === 'SUPER_ADMIN' && !tenantId) {
      throw new ForbiddenException('Super Admin ต้องเข้าข้อมูลผ่าน /super-admin/* เท่านั้น');
    }
    const effectiveBranchId = (role === 'OWNER' || role === 'SUPER_ADMIN')
      ? query.branchId
      : (userBranchId ?? undefined);
    const activeOnly = query.activeOnly === 'true';
    return this.repairsService.findAll({ ...query, branchId: effectiveBranchId, activeOnly }, tenantId);
  }

  @Get('outstanding')
  getOutstandingRepairs(
    @Query('branchId') queryBranchId: string | undefined,
    @CurrentUser('role') role: string,
    @CurrentUser('branchId') userBranchId: string | null,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    const branchId = (role === 'OWNER' || role === 'SUPER_ADMIN')
      ? (queryBranchId ?? undefined)
      : (userBranchId ?? undefined);
    return this.repairsService.getOutstandingRepairs(branchId, tenantId);
  }

  @Get('device-history')
  getDeviceHistory(
    @Query('imei') imei: string,
    @CurrentUser('role') role: string,
    @CurrentUser('branchId') userBranchId: string | null,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.repairsService.getDeviceHistory(imei, role, userBranchId, tenantId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.repairsService.findOne(id, tenantId);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('repair.edit')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRepairDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.repairsService.update(id, dto, actorId, actorName, tenantId);
  }

  @Post(':id/parts')
  @UseGuards(PermissionGuard)
  @RequirePermission('repair.edit')
  addPart(
    @Param('id') id: string,
    @Body() dto: AddRepairPartDto,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.repairsService.addPart(id, dto, tenantId);
  }

  @Delete(':id/parts/:partId')
  @UseGuards(PermissionGuard)
  @RequirePermission('repair.edit')
  removePart(
    @Param('id') id: string,
    @Param('partId') partId: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.repairsService.removePart(id, partId, tenantId);
  }

  @Post(':id/images')
  @UseInterceptors(
    FilesInterceptor('files', 6, {
      storage: imageStorage,
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        // M-4 FIX: validate both MIME type AND file extension.
        // MIME alone is client-supplied and can be forged; combining with an
        // extension whitelist blocks "shell.jpg.php" (ext=.php, fails whitelist).
        if (!file.mimetype.startsWith('image/') || !ALLOWED_IMAGE_EXTS.has(ext)) {
          cb(new BadRequestException('Only image files are allowed (.jpg, .jpeg, .png, .webp, .gif)'), false);
          return;
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadImages(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) throw new BadRequestException('No files uploaded');
    return this.repairsService.addImages(
      id,
      files.map((f) => `/uploads/repairs/${f.filename}`),
    );
  }

  @Post(':id/payment')
  @UseGuards(PermissionGuard)
  @RequirePermission('repair.close')
  processPayment(
    @Param('id') id: string,
    @Body() dto: RepairPaymentDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.repairsService.processPayment(id, dto, userId, tenantId);
  }

  @Post(':id/reverse-payment')
  @UseGuards(PermissionGuard)
  @RequirePermission('repair.close')
  reversePayment(
    @Param('id') id: string,
    @Body() dto: ReversePaymentDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.repairsService.reversePayment(id, dto, userId, tenantId);
  }

  @Post(':id/additional-payment')
  @UseGuards(PermissionGuard)
  @RequirePermission('repair.close')
  addAdditionalPayment(
    @Param('id') id: string,
    @Body() dto: AdditionalPaymentDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.repairsService.addAdditionalPayment(id, dto, userId, tenantId);
  }

  @Post(':id/qc')
  @UseGuards(PermissionGuard)
  @RequirePermission('repairs.qc.perform')
  submitQc(
    @Param('id') id: string,
    @Body() dto: RepairQcDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('name') userName: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.repairsService.submitQc(id, dto, userId, userName, tenantId);
  }
}

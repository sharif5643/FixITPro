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
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { RepairsService } from './repairs.service';
import { CreateRepairDto } from './dto/create-repair.dto';
import { UpdateRepairDto } from './dto/update-repair.dto';
import { AddRepairPartDto } from './dto/add-repair-part.dto';
import { RepairPaymentDto } from './dto/repair-payment.dto';
import { ReversePaymentDto } from './dto/reverse-payment.dto';
import { AdditionalPaymentDto } from './dto/additional-payment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

// UPLOADS_DIR env var allows PROD/DEV separation. Must be set before Node.js starts.
const UPLOADS_DIR = process.env.UPLOADS_DIR ||
  (process.env.NODE_ENV === 'production' ? 'D:\\FixITPro_Prod_Uploads\\repairs' : 'uploads/repairs');
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

const imageStorage = diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${extname(file.originalname)}`);
  },
});

@UseGuards(JwtAuthGuard)
@Controller('repairs')
export class RepairsController {
  constructor(private repairsService: RepairsService) {}

  @Post()
  create(
    @Body() dto: CreateRepairDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
    @CurrentUser('branchId') branchId: string | null,
  ) {
    return this.repairsService.create(dto, actorId, actorName, branchId ?? undefined);
  }

  @Get()
  findAll(
    @Query() query: { status?: string; customerId?: string; date?: string; branchId?: string },
    @CurrentUser('role') role: string,
    @CurrentUser('branchId') userBranchId: string | null,
  ) {
    const effectiveBranchId = (role === 'OWNER' || role === 'SUPER_ADMIN')
      ? query.branchId
      : (userBranchId ?? undefined);
    return this.repairsService.findAll({ ...query, branchId: effectiveBranchId });
  }

  @Get('outstanding')
  getOutstandingRepairs(
    @Query('branchId') queryBranchId: string | undefined,
    @CurrentUser('role') role: string,
    @CurrentUser('branchId') userBranchId: string | null,
  ) {
    const branchId = (role === 'OWNER' || role === 'SUPER_ADMIN')
      ? (queryBranchId ?? undefined)
      : (userBranchId ?? undefined);
    return this.repairsService.getOutstandingRepairs(branchId);
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
  findOne(@Param('id') id: string) {
    return this.repairsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRepairDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.repairsService.update(id, dto, actorId, actorName);
  }

  @Post(':id/parts')
  addPart(@Param('id') id: string, @Body() dto: AddRepairPartDto) {
    return this.repairsService.addPart(id, dto);
  }

  @Delete(':id/parts/:partId')
  removePart(@Param('id') id: string, @Param('partId') partId: string) {
    return this.repairsService.removePart(id, partId);
  }

  @Post(':id/images')
  @UseInterceptors(
    FilesInterceptor('files', 6, {
      storage: imageStorage,
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          cb(new BadRequestException('Only image files are allowed'), false);
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
  processPayment(
    @Param('id') id: string,
    @Body() dto: RepairPaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.repairsService.processPayment(id, dto, userId);
  }

  @Post(':id/reverse-payment')
  reversePayment(
    @Param('id') id: string,
    @Body() dto: ReversePaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.repairsService.reversePayment(id, dto, userId);
  }

  @Post(':id/additional-payment')
  addAdditionalPayment(
    @Param('id') id: string,
    @Body() dto: AdditionalPaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.repairsService.addAdditionalPayment(id, dto, userId);
  }
}

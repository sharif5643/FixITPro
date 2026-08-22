import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ForbiddenException,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard }     from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard }   from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser }       from '../common/decorators/current-user.decorator';
import { PartnerRepairTransfersService } from './partner-repair-transfers.service';

type AuthUser = {
  id:       string;
  name:     string;
  role:     string;
  tenantId: string | null;
  branchId?: string | null;
};

function assertTenantUser(user: AuthUser): asserts user is AuthUser & { tenantId: string } {
  if (!user.tenantId) {
    throw new ForbiddenException('ต้องระบุ Tenant เพื่อใช้งาน Partner Repair Transfer');
  }
}

// ── Repair-scoped endpoints (/repairs/:repairId/partner-transfer) ─────────────

@Controller('repairs')
@UseGuards(JwtAuthGuard, TenantActiveGuard)
export class RepairPartnerTransferController {
  constructor(private readonly svc: PartnerRepairTransfersService) {}

  @Post(':repairId/partner-transfer')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PermissionGuard)
  @RequirePermission('partner_repair.send')
  async create(
    @Param('repairId') repairId: string,
    @Body() body: {
      partnerTenantId:     string;
      relationshipId:      string;
      agreedPartnerPrice?: number;
      pricingNote?:        string;
      sharedDeviceInfo?:   Record<string, unknown>;
      sharedImageUrls?:    string[];
      partnerWorkNote?:    string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    assertTenantUser(user);
    return this.svc.createTransfer(repairId, body, {
      id:       user.id,
      name:     user.name,
      role:     user.role,
      tenantId: user.tenantId,
      branchId: user.branchId,
    });
  }

  @Get(':repairId/partner-transfer')
  async getByRepair(
    @Param('repairId') repairId: string,
    @CurrentUser() user: AuthUser,
  ) {
    assertTenantUser(user);
    const result = await this.svc.getTransferByRepair(repairId, user.tenantId);
    if (!result) throw new NotFoundException('ไม่พบข้อมูลการโอนงานซ่อม');
    return result;
  }
}

// ── Transfer endpoints (/partner-transfers/…) ─────────────────────────────────

@Controller('partner-transfers')
@UseGuards(JwtAuthGuard, TenantActiveGuard)
export class PartnerRepairTransfersController {
  constructor(private readonly svc: PartnerRepairTransfersService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    assertTenantUser(user);
    return this.svc.findAll(user.tenantId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    assertTenantUser(user);
    const result = await this.svc.findOne(id, user.tenantId);
    if (!result) throw new NotFoundException('ไม่พบข้อมูลการโอนงานซ่อม');
    return result;
  }

  @Get(':id/events')
  async getEvents(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    assertTenantUser(user);
    const result = await this.svc.getEvents(id, user.tenantId);
    if (!result) throw new NotFoundException('ไม่พบข้อมูลการโอนงานซ่อม');
    return result;
  }

  // ── Shop B actions ──────────────────────────────────────────────────────

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionGuard)
  @RequirePermission('partner_repair.work')
  accept(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    assertTenantUser(user);
    return this.svc.accept(id, { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId, branchId: user.branchId });
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionGuard)
  @RequirePermission('partner_repair.work')
  reject(
    @Param('id') id: string,
    @Body() body: { rejectionNote?: string },
    @CurrentUser() user: AuthUser,
  ) {
    assertTenantUser(user);
    return this.svc.reject(id, body.rejectionNote, { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId, branchId: user.branchId });
  }

  @Post(':id/device-received')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionGuard)
  @RequirePermission('partner_repair.work')
  deviceReceived(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    assertTenantUser(user);
    return this.svc.deviceReceived(id, { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId, branchId: user.branchId });
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionGuard)
  @RequirePermission('partner_repair.work')
  start(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    assertTenantUser(user);
    return this.svc.start(id, { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId, branchId: user.branchId });
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionGuard)
  @RequirePermission('partner_repair.work')
  complete(
    @Param('id') id: string,
    @Body() body: { completionNote?: string },
    @CurrentUser() user: AuthUser,
  ) {
    assertTenantUser(user);
    return this.svc.complete(id, body.completionNote, { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId, branchId: user.branchId });
  }

  @Post(':id/return-device')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionGuard)
  @RequirePermission('partner_repair.work')
  returnDevice(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    assertTenantUser(user);
    return this.svc.returnDevice(id, { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId, branchId: user.branchId });
  }

  // ── Shop A actions ──────────────────────────────────────────────────────

  @Post(':id/owner-received')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionGuard)
  @RequirePermission('partner_repair.send')
  ownerReceived(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    assertTenantUser(user);
    return this.svc.ownerReceived(id, { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId, branchId: user.branchId });
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionGuard)
  @RequirePermission('partner_repair.send')
  cancel(
    @Param('id') id: string,
    @Body() body: { cancellationNote?: string },
    @CurrentUser() user: AuthUser,
  ) {
    assertTenantUser(user);
    return this.svc.cancel(id, body.cancellationNote, { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId, branchId: user.branchId });
  }

  @Post(':id/recall')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionGuard)
  @RequirePermission('partner_repair.send')
  recall(
    @Param('id') id: string,
    @Body() body: { recallNote?: string },
    @CurrentUser() user: AuthUser,
  ) {
    assertTenantUser(user);
    return this.svc.recall(id, body.recallNote, { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId, branchId: user.branchId });
  }

  @Patch(':id/price')
  @UseGuards(PermissionGuard)
  @RequirePermission('partner_repair.send')
  updatePrice(
    @Param('id') id: string,
    @Body() body: { agreedPartnerPrice?: number; pricingNote?: string },
    @CurrentUser() user: AuthUser,
  ) {
    assertTenantUser(user);
    return this.svc.updatePrice(id, body.agreedPartnerPrice, body.pricingNote, { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId, branchId: user.branchId });
  }
}

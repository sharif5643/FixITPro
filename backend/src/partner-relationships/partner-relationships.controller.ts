import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  ForbiddenException,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PartnerRelationshipsService } from './partner-relationships.service';

type AuthUser = {
  id:       string;
  name:     string;
  role:     string;
  tenantId: string | null;
};

function assertTenantUser(user: AuthUser): asserts user is AuthUser & { tenantId: string } {
  if (!user.tenantId) {
    throw new ForbiddenException('ต้องระบุ Tenant เพื่อใช้งาน Partner Relationship');
  }
}

function assertOwner(user: AuthUser) {
  if (user.role !== 'OWNER') {
    throw new ForbiddenException('เฉพาะ OWNER เท่านั้นที่สามารถจัดการความสัมพันธ์พาร์ทเนอร์ได้');
  }
}

@Controller('partner-relationships')
@UseGuards(JwtAuthGuard, TenantActiveGuard)
export class PartnerRelationshipsController {
  constructor(private readonly svc: PartnerRelationshipsService) {}

  // ── Read (all authenticated tenant users) ────────────────────────────────────

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    assertTenantUser(user);
    return this.svc.findAll(user.tenantId);
  }

  @Get('accepted')
  getAccepted(@CurrentUser() user: AuthUser) {
    assertTenantUser(user);
    return this.svc.getAcceptedPartners(user.tenantId);
  }

  @Get('has-partner')
  async hasPartner(@CurrentUser() user: AuthUser) {
    assertTenantUser(user);
    const has = await this.svc.hasAcceptedPartner(user.tenantId);
    return { hasAcceptedPartner: has };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    assertTenantUser(user);
    const rel = await this.svc.findOne(id, user.tenantId);
    if (!rel) throw new NotFoundException('ไม่พบข้อมูลความสัมพันธ์พาร์ทเนอร์');
    return rel;
  }

  // ── Mutations (OWNER + partner_relationship.manage permission) ────────────────

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('partner_relationship.manage')
  create(
    @Body() body: { partnerEmail: string; note?: string },
    @CurrentUser() user: AuthUser,
  ) {
    assertTenantUser(user);
    assertOwner(user);
    return this.svc.create(user.tenantId, body.partnerEmail, body.note, user.id, user.name);
  }

  @Post(':id/accept')
  @UseGuards(PermissionGuard)
  @RequirePermission('partner_relationship.manage')
  accept(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    assertTenantUser(user);
    assertOwner(user);
    return this.svc.accept(id, user.tenantId, user.id, user.name);
  }

  @Post(':id/reject')
  @UseGuards(PermissionGuard)
  @RequirePermission('partner_relationship.manage')
  @HttpCode(HttpStatus.OK)
  reject(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    assertTenantUser(user);
    assertOwner(user);
    return this.svc.reject(id, user.tenantId, user.id, user.name);
  }

  @Post(':id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermission('partner_relationship.manage')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    assertTenantUser(user);
    assertOwner(user);
    return this.svc.cancel(id, user.tenantId, user.id, user.name);
  }
}

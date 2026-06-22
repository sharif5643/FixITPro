import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClaimsService } from './claims.service';
import { CreateClaimDto } from './dto/create-claim.dto';
import { UpdateClaimStatusDto } from './dto/update-claim-status.dto';
import { UpdateClaimDto } from './dto/update-claim.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, TenantActiveGuard, PermissionGuard)
@Controller('claims')
export class ClaimsController {
  constructor(private service: ClaimsService) {}

  @Get('stats')
  getStats(@CurrentUser('tenantId') tenantId: string | null) {
    return this.service.getStats(tenantId);
  }

  @Get()
  findAll(
    @Query()
    query: { status?: string; claimType?: string; search?: string; page?: string; limit?: string },
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.findAll(query, tenantId);
  }

  @Get(':id')
  findOne(
    @Param('id')           id: string,
    @CurrentUser('id')     userId: string,
    @CurrentUser('role')   role: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    const isElevated = role === 'OWNER' || role === 'SUPER_ADMIN';
    return this.service.findOne(id, userId, isElevated, tenantId);
  }

  @RequirePermission('claims.manage')
  @Post()
  create(
    @Body() dto: CreateClaimDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.create(dto, userId, tenantId);
  }

  @RequirePermission('claims.manage')
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateClaimStatusDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.updateStatus(id, dto, userId, tenantId);
  }

  @RequirePermission('claims.manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClaimDto,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.update(id, dto, tenantId);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { VoidSaleDto } from './dto/void-sale.dto';
import { RefundSaleDto } from './dto/refund-sale.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { ModuleGuard } from '../common/guards/module.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@RequireModule('pos')
@UseGuards(JwtAuthGuard, TenantActiveGuard, ModuleGuard)
@Controller('sales')
export class SalesController {
  constructor(private salesService: SalesService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('sales.create')
  create(
    @Body() dto: CreateSaleDto,
    @CurrentUser('id')       userId: string,
    @CurrentUser('role')     role: string,
    @CurrentUser('branchId') jwtBranchId: string | null,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    // OWNER has branchId=null in JWT — they select a branch in the POS UI.
    // The frontend sends dto.branchId = selectedBranchId so the checkout
    // validates BranchStock for the correct branch.
    // STAFF: always use JWT branchId (body.branchId is untrusted for staff).
    const isElevated = role === 'OWNER' || role === 'SUPER_ADMIN'
    const branchId = isElevated
      ? (dto.branchId ?? jwtBranchId ?? undefined)
      : (jwtBranchId ?? undefined)
    return this.salesService.create(dto, userId, branchId, tenantId);
  }

  @Get()
  findAll(
    @Query() query: { date?: string; customerId?: string; shiftId?: string; branchId?: string; limit?: string; cursor?: string },
    @CurrentUser('role') role: string,
    @CurrentUser('branchId') userBranchId: string | null,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    const effectiveBranchId = (role === 'OWNER' || role === 'SUPER_ADMIN')
      ? query.branchId
      : (userBranchId ?? undefined);
    const limit = query.limit ? parseInt(query.limit, 10) : undefined;
    return this.salesService.findAll({ ...query, branchId: effectiveBranchId, limit }, tenantId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.salesService.findOne(id, tenantId);
  }

  @Post(':id/void')
  @UseGuards(PermissionGuard)
  @RequirePermission('sales.refund')
  voidSale(
    @Param('id') id: string,
    @Body() dto: VoidSaleDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.salesService.voidSale(id, dto.reason, userId, tenantId);
  }

  @Post(':id/refund')
  @UseGuards(PermissionGuard)
  @RequirePermission('sales.refund')
  refundSale(
    @Param('id') id: string,
    @Body() dto: RefundSaleDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.salesService.refundSaleItems(id, dto, userId, tenantId);
  }
}

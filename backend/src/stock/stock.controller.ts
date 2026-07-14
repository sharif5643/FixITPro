import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { StockService } from './stock.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { ModuleGuard } from '../common/guards/module.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

// P1-1 FIX: require inventory module + permission guards on all stock endpoints.
@RequireModule('inventory')
@UseGuards(JwtAuthGuard, TenantActiveGuard, ModuleGuard)
@Controller('stock')
export class StockController {
  private readonly logger = new Logger(StockController.name);

  constructor(private stockService: StockService) {}

  @Post('adjust')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.manage')
  adjustStock(
    @Body() dto: AdjustStockDto,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('role')     actorRole: string,
    @CurrentUser('branchId') actorBranchId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    const isOwner = actorRole === 'OWNER' || actorRole === 'SUPER_ADMIN';
    if (!isOwner) {
      if (!actorBranchId) {
        throw new BadRequestException('ไม่พบข้อมูลสาขาของพนักงาน กรุณาติดต่อผู้ดูแลระบบ');
      }
      // Always use JWT branchId for staff — never trust body.branchId
      dto.branchId = actorBranchId;
    } else {
      if (!dto.branchId) {
        throw new BadRequestException('กรุณาเลือกสาขาก่อนเพิ่ม/ปรับสต็อก');
      }
    }

    if (process.env.NODE_ENV === 'development') {
      this.logger.debug(`[adjust] actor=${actorId} role=${actorRole} jwtBranch=${actorBranchId ?? null} bodyBranch=${dto.branchId ?? null} product=${dto.productId} type=${dto.type} qty=${dto.quantity}`);
    }

    return this.stockService.adjustStock(dto, actorId, actorName, tenantId);
  }

  @Get('movements/:productId')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.view')
  getMovements(
    @Param('productId')      productId: string,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('branchId') userBranchId: string | null,
    @CurrentUser('role')     role: string,
    @Query('branchId')       queryBranchId?: string,
  ) {
    const isElevated = role === 'OWNER' || role === 'SUPER_ADMIN';
    const branchId = isElevated ? (queryBranchId ?? undefined) : (userBranchId ?? undefined);
    return this.stockService.getMovements(productId, tenantId, branchId);
  }

  @Get('low-stock')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.view')
  getLowStockProducts(
    @CurrentUser('role')     role: string,
    @CurrentUser('branchId') jwtBranchId: string | null,
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId')       queryBranchId?: string,
  ) {
    const isElevated = role === 'OWNER' || role === 'SUPER_ADMIN';
    const effectiveBranchId = isElevated
      ? (queryBranchId || undefined)
      : (jwtBranchId ?? undefined);
    return this.stockService.getLowStockProducts(effectiveBranchId, tenantId);
  }
}

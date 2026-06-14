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
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, TenantActiveGuard)
@Controller('stock')
export class StockController {
  private readonly logger = new Logger(StockController.name);

  constructor(private stockService: StockService) {}

  @Post('adjust')
  adjustStock(
    @Body() dto: AdjustStockDto,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('role')     actorRole: string,
    @CurrentUser('branchId') actorBranchId: string,
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

    return this.stockService.adjustStock(dto, actorId, actorName);
  }

  @Get('movements/:productId')
  getMovements(@Param('productId') productId: string) {
    return this.stockService.getMovements(productId);
  }

  @Get('low-stock')
  getLowStockProducts(
    @CurrentUser('role')     role: string,
    @CurrentUser('branchId') jwtBranchId: string | null,
    @Query('branchId')       queryBranchId?: string,
  ) {
    const isElevated = role === 'OWNER' || role === 'SUPER_ADMIN';
    const effectiveBranchId = isElevated
      ? (queryBranchId || undefined)
      : (jwtBranchId ?? undefined);
    return this.stockService.getLowStockProducts(effectiveBranchId);
  }
}

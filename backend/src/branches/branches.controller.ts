import {
  Controller, Get, Post, Patch, Delete, Param, Query, Body,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { SetBranchStockDto } from './dto/set-branch-stock.dto';

@UseGuards(JwtAuthGuard, PermissionGuard, RolesGuard)
@Controller('branches')
export class BranchesController {
  constructor(private readonly svc: BranchesService) {}

  // ── Branches ──────────────────────────────────────────────────────────────

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('includeInactive') inc?: string,
  ) {
    return this.svc.findAll(tenantId, inc === 'true');
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.svc.findOne(id, tenantId);
  }

  @Post()
  @RequirePermission('branches.manage')
  create(
    @Body() dto: CreateBranchDto,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.svc.create(dto, actorId, actorName, tenantId);
  }

  @Patch(':id')
  @RequirePermission('branches.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.svc.update(id, dto, actorId, actorName, tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('branches.manage')
  deactivate(
    @Param('id') id: string,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.svc.deactivate(id, actorId, actorName, tenantId);
  }

  // ── Branch Stock ──────────────────────────────────────────────────────────

  @Get(':id/stock')
  @RequirePermission('stock.adjust')
  getBranchStock(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query('search') search?: string,
  ) {
    return this.svc.getBranchStock(id, tenantId, { search });
  }

  @Post(':id/stock')
  @RequirePermission('stock.adjust')
  setBranchStock(
    @Param('id') id: string,
    @Body() dto: SetBranchStockDto,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.svc.setBranchStock(id, dto, actorId, actorName, tenantId);
  }

  // ── Stock Transfers ───────────────────────────────────────────────────────

  @Get('transfers/list')
  @RequirePermission('stock.transfer')
  listTransfers(
    @Query() query: { branchId?: string; status?: string; productId?: string; startDate?: string; endDate?: string },
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.svc.listTransfers(query, tenantId);
  }

  @Post('transfers')
  @RequirePermission('stock.transfer')
  createTransfer(
    @Body() dto: CreateTransferDto,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('role')     actorRole: string,
    @CurrentUser('branchId') actorBranchId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    const isOwner = actorRole === 'OWNER' || actorRole === 'SUPER_ADMIN';
    if (!isOwner && actorBranchId) {
      dto.toBranchId = actorBranchId;
    }
    return this.svc.createTransfer(dto, actorId, actorName, tenantId);
  }

  @Patch('transfers/:id/approve')
  @RequirePermission('stock.transfer')
  approveTransfer(
    @Param('id') id: string,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('branchId') actorBranchId: string,
    @CurrentUser('role')     actorRole: string,
  ) {
    return this.svc.approveTransfer(id, actorId, actorName, actorBranchId, actorRole);
  }

  @Patch('transfers/:id/reject')
  @RequirePermission('stock.transfer')
  rejectTransfer(
    @Param('id') id: string,
    @Body('rejectReason')    rejectReason?: string,
    @CurrentUser('id')       actorId?: string,
    @CurrentUser('name')     actorName?: string,
    @CurrentUser('branchId') actorBranchId?: string,
    @CurrentUser('role')     actorRole?: string,
  ) {
    return this.svc.rejectTransfer(id, rejectReason, actorId, actorName, actorBranchId, actorRole);
  }

  @Patch('transfers/:id/dispatch')
  @RequirePermission('stock.transfer')
  dispatchTransfer(
    @Param('id') id: string,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('branchId') actorBranchId: string,
    @CurrentUser('role')     actorRole: string,
  ) {
    return this.svc.dispatchTransfer(id, actorId, actorName, actorBranchId, actorRole);
  }

  @Patch('transfers/:id/receive')
  @RequirePermission('stock.transfer')
  receiveTransfer(
    @Param('id') id: string,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('branchId') actorBranchId: string,
    @CurrentUser('role')     actorRole: string,
  ) {
    return this.svc.receiveTransfer(id, actorId, actorName, actorBranchId, actorRole);
  }

  @Patch('transfers/:id/complete')
  @RequirePermission('stock.transfer')
  @Roles('OWNER', 'SUPER_ADMIN')
  completeTransfer(
    @Param('id') id: string,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.svc.completeTransfer(id, actorId, actorName, tenantId);
  }

  @Patch('transfers/:id/cancel')
  @RequirePermission('stock.transfer')
  cancelTransfer(
    @Param('id') id: string,
    @Body('reason')          reason: string,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('branchId') actorBranchId: string,
    @CurrentUser('role')     actorRole: string,
  ) {
    return this.svc.cancelTransfer(id, reason ?? '', actorId, actorName, actorBranchId, actorRole);
  }

  // ── Branch Approval ───────────────────────────────────────────────────────

  @Get(':id/stock/next-code')
  @RequirePermission('stock.adjust')
  getNextStockCode(@Param('id') id: string) {
    return this.svc.getNextStockCode(id);
  }

  @Post(':id/approve')
  @RequirePermission('branches.manage')
  @Roles('SUPER_ADMIN')
  approveBranch(
    @Param('id') id: string,
    @CurrentUser('id')   actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.svc.approveBranch(id, actorId, actorName);
  }

  @Post(':id/reject')
  @RequirePermission('branches.manage')
  @Roles('SUPER_ADMIN')
  rejectBranch(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser('id')   actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.svc.rejectBranch(id, reason ?? '', actorId, actorName);
  }

  @Post(':id/suspend')
  @RequirePermission('branches.manage')
  @Roles('SUPER_ADMIN')
  suspendBranch(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser('id')   actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.svc.suspendBranch(id, reason ?? '', actorId, actorName);
  }
}

import {
  Controller,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { AccountingReconciliationService } from './accounting-reconciliation.service';

@Controller('admin/accounting')
@UseGuards(JwtAuthGuard, TenantActiveGuard, PermissionGuard)
export class AccountingReconciliationController {
  constructor(private readonly reconciliation: AccountingReconciliationService) {}

  /**
   * POST /admin/accounting/run-reconciliation[?tenantId=xxx]
   * Manually trigger the reconciliation scan for the caller's tenant.
   * SUPER_ADMIN may pass ?tenantId=xxx to target a specific tenant.
   * Requires: accounting.admin (OWNER) or SUPER_ADMIN.
   */
  @Post('run-reconciliation')
  @RequirePermission('accounting.admin')
  async runReconciliation(
    @Request()              req:           any,
    @Query('tenantId')      tenantIdParam?: string,
  ) {
    const { tenantId, role } = req.user as { tenantId?: string; role?: string };

    // SUPER_ADMIN can target a specific tenant via query param; owners are always scoped
    const targetTenantId =
      role === 'SUPER_ADMIN' && tenantIdParam ? tenantIdParam : tenantId;

    return this.reconciliation.runReconciliation(
      targetTenantId ? { tenantId: targetTenantId } : undefined,
    );
  }

  /**
   * POST /admin/accounting/retry-sale/:saleId
   * Manually retry accounting for a specific sale.
   * Tenant isolation enforced: OWNER may only retry their own tenant's sales.
   * SUPER_ADMIN may retry any sale.
   * Requires: accounting.admin (OWNER) or SUPER_ADMIN.
   */
  @Post('retry-sale/:saleId')
  @RequirePermission('accounting.admin')
  async retrySale(
    @Param('saleId') saleId: string,
    @Request()       req:    any,
  ) {
    const { tenantId, role } = req.user as { tenantId?: string; role?: string };
    return this.reconciliation.retrySale(saleId, tenantId ?? '', role ?? '');
  }
}

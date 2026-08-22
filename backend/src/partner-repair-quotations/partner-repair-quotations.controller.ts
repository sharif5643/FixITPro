import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard }      from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard }   from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { PartnerRepairQuotationsService } from './partner-repair-quotations.service';

@Controller()
@UseGuards(JwtAuthGuard, TenantActiveGuard, PermissionGuard)
export class PartnerRepairQuotationsController {
  constructor(private svc: PartnerRepairQuotationsService) {}

  // ── Nested under transfer ──────────────────────────────────────────────────

  @Post('partner-transfers/:transferId/quotations')
  @RequirePermission('partner_repair.quote')
  createQuotation(
    @Param('transferId') transferId: string,
    @Body() body: { amount: number; note?: string },
    @Request() req: any,
  ) {
    return this.svc.createQuotation(transferId, body, req.user);
  }

  @Get('partner-transfers/:transferId/quotations')
  @RequirePermission('partner_repair.quote')
  getQuotations(
    @Param('transferId') transferId: string,
    @Request() req: any,
  ) {
    return this.svc.getQuotations(transferId, req.user.tenantId);
  }

  @Get('partner-transfers/:transferId/quotations/active')
  @RequirePermission('partner_repair.quote')
  getActiveQuotation(
    @Param('transferId') transferId: string,
    @Request() req: any,
  ) {
    return this.svc.getActiveQuotation(transferId, req.user.tenantId);
  }

  // ── Quotation-level actions ────────────────────────────────────────────────

  @Post('partner-quotations/:id/accept')
  @RequirePermission('partner_repair.quote')
  accept(@Param('id') id: string, @Request() req: any) {
    return this.svc.acceptQuotation(id, req.user);
  }

  @Post('partner-quotations/:id/reject')
  @RequirePermission('partner_repair.quote')
  reject(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @Request() req: any,
  ) {
    return this.svc.rejectQuotation(id, body?.note, req.user);
  }

  @Post('partner-quotations/:id/counter')
  @RequirePermission('partner_repair.quote')
  counter(
    @Param('id') id: string,
    @Body() body: { amount: number; note?: string },
    @Request() req: any,
  ) {
    return this.svc.counterQuotation(id, body, req.user);
  }

  @Get('partner-quotations/:id/events')
  @RequirePermission('partner_repair.quote')
  events(@Param('id') id: string, @Request() req: any) {
    return this.svc.getQuotationEvents(id, req.user.tenantId);
  }
}

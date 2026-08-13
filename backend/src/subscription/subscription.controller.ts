import { Controller, Get, Patch, Post, Param, Body, UseGuards, Req } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { PlanLimitsService } from '../plan-limits/plan-limits.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsIn,
  IsPositive,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

class UpdateSubscriptionDto {
  @IsOptional() @IsString()                           planName?: string;
  @IsOptional() @IsIn(['TRIAL','ACTIVE','EXPIRED','SUSPENDED']) status?: string;
  @IsOptional() @IsDateString()                       expiryDate?: string;
  @IsOptional() @IsString()                           notes?: string;
}

class AddRenewalDto {
  @IsDateString()                                     expiryDate: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString()                           note?: string;
  @IsOptional() @IsString()                           action?: string;
}

class AddAddonDto {
  @IsIn(['STORAGE_GB', 'BRANCH'])                     type: string;
  @Type(() => Number) @IsNumber() @IsPositive()       quantity: number;
  @Type(() => Number) @IsNumber() @Min(0)             priceThb: number;
  @IsOptional() @IsString()                           note?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('subscription')
export class SubscriptionController {
  constructor(
    private subscriptionService: SubscriptionService,
    private planLimits: PlanLimitsService,
  ) {}

  @Get()
  getSubscription(@Req() req: any) {
    const tenantId: string | undefined = req.user?.tenantId;
    if (tenantId) {
      return this.subscriptionService.getSubscriptionForTenant(tenantId);
    }
    return this.subscriptionService.getSubscription();
  }

  @Roles('OWNER', 'SUPER_ADMIN')
  @Patch()
  updateSubscription(@Body() dto: UpdateSubscriptionDto, @Req() req: any) {
    const tenantId: string | undefined = req.user?.tenantId;
    const role: string = req.user?.role;
    // OWNER updates only their own tenant's notes — never the global singleton
    if (role !== 'SUPER_ADMIN' && tenantId) {
      return this.subscriptionService.updateTenantNotes(tenantId, dto.notes);
    }
    // SUPER_ADMIN updates global singleton (legacy / system-level)
    return this.subscriptionService.updateSubscription(dto);
  }

  @Roles('OWNER', 'SUPER_ADMIN')
  @Post('renew')
  addRenewal(@Body() dto: AddRenewalDto, @Req() req: any) {
    const tenantId: string | undefined = req.user?.tenantId;
    const role: string = req.user?.role;
    // OWNER submits a renewal request for their own tenant (SA must verify payment)
    if (role !== 'SUPER_ADMIN' && tenantId) {
      return this.subscriptionService.requestTenantRenewal(tenantId, { note: dto.note, action: dto.action });
    }
    // SUPER_ADMIN renews global singleton (legacy)
    return this.subscriptionService.addRenewal(dto);
  }

  // Phase 20: Usage summary for OWNER dashboard / settings subscription page
  @Roles('OWNER', 'SUPER_ADMIN')
  @Get('usage')
  getUsage(@Req() req: any) {
    const tenantId: string | undefined = req.user?.tenantId;
    if (!tenantId) return { branches: null, storage: null }; // SA context — not applicable
    return this.planLimits.getUsageSummary(tenantId);
  }

  // Phase 19: SA grants an add-on to a specific tenant
  @Roles('SUPER_ADMIN')
  @Post('addons/:tenantId')
  async grantAddon(
    @Param('tenantId') tenantId: string,
    @Body() dto: AddAddonDto,
    @Req() req: any,
  ) {
    return this.subscriptionService.grantAddon(tenantId, {
      type:        dto.type,
      quantity:    dto.quantity,
      priceThb:    dto.priceThb,
      note:        dto.note,
      grantedById: req.user?.id,
    });
  }

  // Phase 19: SA lists addons for a tenant
  @Roles('SUPER_ADMIN')
  @Get('addons/:tenantId')
  getAddons(@Param('tenantId') tenantId: string) {
    return this.subscriptionService.getAddons(tenantId);
  }
}

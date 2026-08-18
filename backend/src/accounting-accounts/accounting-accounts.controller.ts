import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AccountingAccountsService } from './accounting-accounts.service';
import { InitializeAccountsDto } from './dto/initialize-accounts.dto';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

// All endpoints in this controller require OWNER or SUPER_ADMIN role.
// Regular staff cannot view or modify the chart of accounts.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'SUPER_ADMIN')
@Controller('accounting/accounts')
export class AccountingAccountsController {
  constructor(private readonly service: AccountingAccountsService) {}

  // GET /api/v1/accounting/accounts
  // List all chart-of-accounts entries for the current tenant.
  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.service.listForTenant(tenantId);
  }

  // POST /api/v1/accounting/accounts/dry-run
  // Preview what would be created by initialize — no writes.
  @Post('dry-run')
  dryRun(
    @CurrentUser('tenantId') callerTenantId: string,
    @CurrentUser('role') role: string,
    @Body() dto: InitializeAccountsDto,
  ) {
    const tenantId = role === 'SUPER_ADMIN' && dto.tenantId ? dto.tenantId : callerTenantId;
    return this.service.dryRunForTenant(tenantId);
  }

  // POST /api/v1/accounting/accounts/initialize
  // Create all standard accounts for a tenant (idempotent — safe to call multiple times).
  @Post('initialize')
  initialize(
    @CurrentUser('tenantId') callerTenantId: string,
    @CurrentUser('role') role: string,
    @Body() dto: InitializeAccountsDto,
  ) {
    const tenantId = role === 'SUPER_ADMIN' && dto.tenantId ? dto.tenantId : callerTenantId;
    return this.service.initializeForTenant(tenantId);
  }

  // POST /api/v1/accounting/accounts
  // Create a custom (non-system) account for the current tenant.
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateAccountDto,
  ) {
    return this.service.createCustom(tenantId, dto);
  }

  // PATCH /api/v1/accounting/accounts/:id
  // Update name, nameTh, subType, sortOrder, or isActive.
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.service.update(id, tenantId, dto);
  }

  // PATCH /api/v1/accounting/accounts/:id/activate
  @Patch(':id/activate')
  activate(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.service.activate(id, tenantId);
  }

  // PATCH /api/v1/accounting/accounts/:id/deactivate
  @Patch(':id/deactivate')
  deactivate(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.service.deactivate(id, tenantId);
  }
}

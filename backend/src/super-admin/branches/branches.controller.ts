import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BranchesService } from './branches.service';

@Controller('super-admin/branches')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get('stats')
  stats() {
    return this.branchesService.stats();
  }

  @Get()
  findAll(
    @Query('tenantId') tenantId?: string,
    @Query('search') search?: string,
    @Query('orphanOnly') orphanOnly?: string,
  ) {
    return this.branchesService.findAll(tenantId, search, orphanOnly === 'true');
  }

  @Get(':id/reassign-preview')
  reassignPreview(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.branchesService.reassignPreview(id, tenantId);
  }

  @Patch(':id/reassign-tenant')
  reassignTenant(
    @Param('id') id: string,
    @Body() body: { tenantId: string; updateRelatedData?: boolean },
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.branchesService.reassignTenant(id, body, actorId, actorName);
  }
}

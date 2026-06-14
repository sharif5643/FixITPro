import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
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
  ) {
    return this.branchesService.findAll(tenantId, search);
  }
}

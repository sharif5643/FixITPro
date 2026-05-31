import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { TechniciansService } from './technicians.service';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('technicians')
export class TechniciansController {
  constructor(private readonly svc: TechniciansService) {}

  @Get()
  @RequirePermission('technician.view')
  findAll(@Query() query: { startDate?: string; endDate?: string }) {
    return this.svc.findAll(query);
  }

  @Get('leaderboard')
  @RequirePermission('technician.view')
  leaderboard(@Query() query: { startDate?: string; endDate?: string; limit?: string }) {
    return this.svc.getLeaderboard(query);
  }

  @Get(':id')
  @RequirePermission('technician.view')
  findOne(
    @Param('id') id: string,
    @Query() query: { startDate?: string; endDate?: string },
  ) {
    return this.svc.findOne(id, query);
  }

  @Get(':id/daily')
  @RequirePermission('technician.view')
  getDailyData(
    @Param('id') id: string,
    @Query() query: { startDate?: string; endDate?: string },
  ) {
    return this.svc.getDailyData(id, query.startDate, query.endDate);
  }
}

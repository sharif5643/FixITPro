import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { SuperAdminAuditInterceptor } from '../super-admin-audit.interceptor';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsersService } from './users.service';

@Controller('super-admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@UseInterceptors(SuperAdminAuditInterceptor)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('stats')
  stats() {
    return this.usersService.stats();
  }

  @Get()
  findAll(
    @Query('tenantId') tenantId?: string,
    @Query('role') role?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.findAll(tenantId, role, search);
  }
}

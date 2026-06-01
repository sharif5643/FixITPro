import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClaimsService } from './claims.service';
import { CreateClaimDto } from './dto/create-claim.dto';
import { UpdateClaimStatusDto } from './dto/update-claim-status.dto';
import { UpdateClaimDto } from './dto/update-claim.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('claims')
export class ClaimsController {
  constructor(private service: ClaimsService) {}

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @Get()
  findAll(
    @Query()
    query: { status?: string; claimType?: string; search?: string; page?: string; limit?: string },
  ) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(
    @Param('id')         id: string,
    @CurrentUser('id')   userId: string,
    @CurrentUser('role') role: string,
  ) {
    const isElevated = role === 'OWNER' || role === 'SUPER_ADMIN';
    return this.service.findOne(id, userId, isElevated);
  }

  @RequirePermission('claims.manage')
  @Post()
  create(@Body() dto: CreateClaimDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @RequirePermission('claims.manage')
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateClaimStatusDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.updateStatus(id, dto, userId);
  }

  @RequirePermission('claims.manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClaimDto) {
    return this.service.update(id, dto);
  }
}

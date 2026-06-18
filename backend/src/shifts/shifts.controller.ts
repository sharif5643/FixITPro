import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { OpenShiftDto } from './dto/open-shift.dto';
import { CloseShiftDto } from './dto/close-shift.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('shifts')
export class ShiftsController {
  private readonly logger = new Logger(ShiftsController.name);

  constructor(private shiftsService: ShiftsService) {}

  @Post('open')
  async openShift(
    @Body() dto: OpenShiftDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('branchId') branchId: string | null,
  ) {
    this.logger.log(`openShift userId=${userId} branchId=${branchId ?? 'null'} openBalance=${dto.openBalance}`);
    try {
      return await this.shiftsService.openShift(dto, userId, branchId ?? undefined);
    } catch (err) {
      this.logger.error(`openShift failed userId=${userId} branchId=${branchId ?? 'null'}: ${err?.message}`, err?.stack);
      throw err;
    }
  }

  @Post(':id/close')
  closeShift(
    @Param('id') id: string,
    @Body() dto: CloseShiftDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.shiftsService.closeShift(id, dto, userId);
  }

  @Get('current')
  getCurrentShift(@CurrentUser('id') userId: string) {
    return this.shiftsService.getCurrentShift(userId);
  }

  @Get()
  findAll(
    @Query() query: { date?: string; userId?: string; branchId?: string },
    @CurrentUser('role')     role: string,
    @CurrentUser('branchId') userBranchId: string | null,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    const effectiveBranchId = (role === 'OWNER' || role === 'SUPER_ADMIN')
      ? query.branchId
      : (userBranchId ?? undefined);
    return this.shiftsService.findAll({ ...query, branchId: effectiveBranchId, tenantId });
  }
}

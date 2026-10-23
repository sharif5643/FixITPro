import { Controller, Delete, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LineSimService } from './line-sim.service';

/** A staff member links their own LINE to report SIM / package sales there. */
@Controller('line/staff')
@UseGuards(JwtAuthGuard)
export class LineStaffController {
  constructor(private sim: LineSimService) {}

  @Get('link')
  link(@CurrentUser('id') userId: string) {
    return this.sim.linkInfo(userId);
  }

  @Delete('link')
  unlink(@CurrentUser('id') userId: string) {
    return this.sim.unlink(userId);
  }
}

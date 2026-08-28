import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JournalService } from './journal.service';

@Controller('accounting/journals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'SUPER_ADMIN')
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  // GET /api/v1/accounting/journals
  @Get()
  findMany(
    @CurrentUser('tenantId') callerTenantId: string,
    @CurrentUser('role')     role:           string,
    @Query('tenantId')       tenantIdParam?: string,
    @Query('startDate')      startDate?:     string,
    @Query('endDate')        endDate?:       string,
    @Query('sourceType')     sourceType?:    string,
    @Query('sourceId')       sourceId?:      string,
    @Query('isVoided')       isVoided?:      string,
    @Query('page')           page?:          string,
    @Query('limit')          limit?:         string,
  ) {
    const tenantId = role === 'SUPER_ADMIN' && tenantIdParam ? tenantIdParam : callerTenantId;
    return this.journal.findMany({
      tenantId,
      startDate:  startDate  ? new Date(startDate)  : undefined,
      endDate:    endDate    ? new Date(endDate)    : undefined,
      sourceType: sourceType ?? undefined,
      sourceId:   sourceId   ?? undefined,
      isVoided:   isVoided !== undefined ? isVoided === 'true' : undefined,
      page:       page  ? parseInt(page,  10) : undefined,
      limit:      limit ? parseInt(limit, 10) : undefined,
    });
  }

  // GET /api/v1/accounting/journals/:id
  @Get(':id')
  findById(
    @Param('id')             id:             string,
    @CurrentUser('tenantId') tenantId:       string,
  ) {
    return this.journal.findById(id, tenantId);
  }
}

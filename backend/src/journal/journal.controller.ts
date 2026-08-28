import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray, ArrayMinSize, IsString, IsNotEmpty,
  IsDateString, IsOptional, IsNumber, Min, ValidateNested, MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JournalService, JOURNAL_SOURCE } from './journal.service';

class ManualLineDto {
  @IsString() @IsNotEmpty()
  accountCode!: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  debit?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  credit?: number;

  @IsOptional() @IsString()
  note?: string;
}

class VoidJournalDto {
  @IsString() @IsNotEmpty() @MinLength(3)
  reason!: string;
}

class CreateManualJournalDto {
  @IsDateString()
  entryDate!: string;

  @IsString() @IsNotEmpty()
  description!: string;

  @IsArray() @ArrayMinSize(2)
  @ValidateNested({ each: true }) @Type(() => ManualLineDto)
  lines!: ManualLineDto[];

  @IsOptional() @IsString()
  branchId?: string;
}

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
    @Param('id')             id:       string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.journal.findById(id, tenantId);
  }

  // PATCH /api/v1/accounting/journals/:id/void
  @Patch(':id/void')
  voidEntry(
    @Param('id')             id:       string,
    @Body()                  dto:      VoidJournalDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id')       userId:   string,
  ) {
    return this.journal.void(id, tenantId, { reason: dto.reason, actorId: userId });
  }

  // POST /api/v1/accounting/journals/manual
  @Post('manual')
  async createManual(
    @Body() dto: CreateManualJournalDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id')       userId:   string,
  ) {
    const { journal } = await this.journal.create({
      tenantId,
      branchId:    dto.branchId ?? null,
      entryDate:   new Date(dto.entryDate),
      description: dto.description,
      sourceType:  JOURNAL_SOURCE.MANUAL,
      sourceId:    null,
      postedById:  userId,
      lines: dto.lines.map((l, i) => ({
        accountCode: l.accountCode,
        debit:       l.debit  ?? 0,
        credit:      l.credit ?? 0,
        note:        l.note,
        sortOrder:   i,
      })),
    });
    return journal;
  }
}

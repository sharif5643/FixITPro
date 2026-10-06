import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { ModuleGuard } from '../common/guards/module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FormalDocumentsService } from './formal-documents.service';
import { FormalDocumentDraftDto } from './dto/issue-formal-document.dto';

function shop(tenantId: string | null): string {
  if (!tenantId) throw new ForbiddenException('ต้องเข้าใช้งานในนามร้าน');
  return tenantId;
}

/** Formal A4 documents (quotation / invoice / receipt) for agencies and companies. */
@RequireModule('repair')
@UseGuards(JwtAuthGuard, TenantActiveGuard, ModuleGuard)
@Controller('formal-documents')
export class FormalDocumentsController {
  constructor(private service: FormalDocumentsService) {}

  @Post('draft')
  draft(@Body() dto: FormalDocumentDraftDto, @CurrentUser('tenantId') tenantId: string | null) {
    return this.service.draft(dto, shop(tenantId));
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('repair.edit')
  issue(
    @Body() dto: FormalDocumentDraftDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.issue(dto, actorId, actorName, shop(tenantId));
  }

  @Get()
  list(
    @Query('repairId') repairId: string | undefined,
    @Query('customerId') customerId: string | undefined,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.list({ repairId, customerId }, shop(tenantId));
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string | null) {
    return this.service.findOne(id, shop(tenantId));
  }
}

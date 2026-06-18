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
import { ExpensesService } from './expenses.service';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { VoidExpenseDto } from './dto/void-expense.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { ModuleGuard } from '../common/guards/module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@RequireModule('finance')
@UseGuards(JwtAuthGuard, TenantActiveGuard, ModuleGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private expensesService: ExpensesService) {}

  // ── Categories ───────────────────────────────────────────────────────────────

  @Get('categories')
  findAllCategories(@CurrentUser('tenantId') tenantId: string | null) {
    return this.expensesService.findAllCategories(tenantId);
  }

  @Post('categories')
  createCategory(
    @Body() dto: CreateExpenseCategoryDto,
    @CurrentUser('role')     role: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.expensesService.createCategory(dto, role, tenantId);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseCategoryDto,
    @CurrentUser('role')     role: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.expensesService.updateCategory(id, dto, role, tenantId);
  }

  // ── Summary routes — must come before :id ───────────────────────────────────

  @Get('summary/daily')
  getDailySummary(
    @Query('date') date: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    const d = date || new Date().toISOString().slice(0, 10);
    return this.expensesService.getDailySummary(d, tenantId);
  }

  @Get('summary/monthly')
  getMonthlySummary(
    @Query('year') year: string,
    @Query('month') month: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    const y = parseInt(year)  || new Date().getFullYear();
    const m = parseInt(month) || new Date().getMonth() + 1;
    return this.expensesService.getMonthlySummary(y, m, tenantId);
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  @Post()
  create(
    @Body() dto: CreateExpenseDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('branchId') branchId: string | null,
  ) {
    return this.expensesService.create(dto, userId, role, branchId ?? undefined);
  }

  @Get()
  findAll(
    @Query() query: {
      startDate?:  string;
      endDate?:    string;
      categoryId?: string;
      showVoided?: string;
      page?:       string;
      limit?:      string;
      branchId?:   string;
    },
    @CurrentUser('role') role: string,
    @CurrentUser('branchId') userBranchId: string | null,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    const effectiveBranchId = (role === 'OWNER' || role === 'SUPER_ADMIN')
      ? query.branchId
      : (userBranchId ?? undefined);
    return this.expensesService.findAll({ ...query, branchId: effectiveBranchId }, tenantId);
  }

  @Get(':id')
  findOne(
    @Param('id')             id: string,
    @CurrentUser('branchId') branchId: string | null,
    @CurrentUser('role')     role: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    const isElevated = role === 'OWNER' || role === 'SUPER_ADMIN';
    return this.expensesService.findOne(id, branchId, isElevated, tenantId);
  }

  @Post(':id/void')
  voidExpense(
    @Param('id') id: string,
    @Body() dto: VoidExpenseDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.expensesService.voidExpense(id, dto, userId, role, tenantId);
  }
}

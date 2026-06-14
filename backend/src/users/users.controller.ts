import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ModuleGuard } from '../common/guards/module.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IsEmail, IsOptional, IsString, IsIn, MinLength } from 'class-validator';

class CreateUserDto {
  @IsEmail() email: string;
  @IsString() name: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() @MinLength(6) password: string;
  @IsOptional() @IsIn(['OWNER','MANAGER','CASHIER','TECHNICIAN','STOCK_STAFF']) role?: string;
  @IsOptional() @IsString() branchId?: string;
}

class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsIn(['OWNER','MANAGER','CASHIER','TECHNICIAN','STOCK_STAFF']) role?: string;
  @IsOptional() @IsString() branchId?: string;
}

class AssignBranchDto {
  @IsOptional() @IsString() branchId?: string | null;
}


@RequireModule('user_management')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@Roles('OWNER', 'MANAGER')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  findAll(@CurrentUser() requester: { id: string; tenantId: string | null }) {
    return this.usersService.findAll(requester.tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Roles('OWNER', 'MANAGER')
  @Post()
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() requester: { id: string; tenantId: string | null },
  ) {
    return this.usersService.create(dto, requester);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() requester: { id: string; tenantId: string | null; name?: string },
  ) {
    return this.usersService.update(id, dto, requester.id, requester.tenantId, requester.name);
  }

  @Patch(':id/branch')
  assignBranch(
    @Param('id') id: string,
    @Body() body: AssignBranchDto,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('name') requesterName: string,
  ) {
    return this.usersService.assignBranch(id, body.branchId ?? null, requesterId, requesterName);
  }

  @Patch(':id/toggle')
  toggleActive(
    @Param('id') id: string,
    @CurrentUser() requester: { id: string; tenantId: string | null },
  ) {
    return this.usersService.toggleActive(id, requester.id, requester.tenantId);
  }

  @Patch(':id/reset-password')
  resetPassword(
    @Param('id') id: string,
    @CurrentUser() requester: { id: string; tenantId: string | null },
  ) {
    return this.usersService.resetPassword(id, requester.id, requester.tenantId);
  }
}

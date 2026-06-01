import { Controller, Get, Patch, Post, Body, UseGuards } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsIn,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

class UpdateSubscriptionDto {
  @IsOptional() @IsString()                           planName?: string;
  @IsOptional() @IsIn(['TRIAL','ACTIVE','EXPIRED','SUSPENDED']) status?: string;
  @IsOptional() @IsDateString()                       expiryDate?: string;
  @IsOptional() @IsString()                           notes?: string;
}

class AddRenewalDto {
  @IsDateString()                                     expiryDate: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString()                           note?: string;
  @IsOptional() @IsString()                           action?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('subscription')
export class SubscriptionController {
  constructor(private subscriptionService: SubscriptionService) {}

  @Get()
  getSubscription() {
    return this.subscriptionService.getSubscription();
  }

  @Roles('OWNER', 'SUPER_ADMIN')
  @Patch()
  updateSubscription(@Body() dto: UpdateSubscriptionDto) {
    return this.subscriptionService.updateSubscription(dto);
  }

  @Roles('OWNER', 'SUPER_ADMIN')
  @Post('renew')
  addRenewal(@Body() dto: AddRenewalDto) {
    return this.subscriptionService.addRenewal(dto);
  }
}

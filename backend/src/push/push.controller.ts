import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PushService } from './push.service';

class PushDeviceDto {
  @IsString() @Length(20, 4096)                       token: string;
  @IsOptional() @IsIn(['pos', 'staff', 'dev'])         app?: string;
  @IsOptional() @IsIn(['android', 'ios'])              platform?: string;
}

/** The app registers its phone for the signed-in account, and removes it on sign-out. */
@UseGuards(JwtAuthGuard)
@Controller('push/devices')
export class PushController {
  constructor(private push: PushService) {}

  @Post()
  register(@Body() dto: PushDeviceDto, @CurrentUser('id') userId: string, @CurrentUser('tenantId') tenantId: string | null) {
    return this.push.register(userId, tenantId ?? null, dto.token, dto.app, dto.platform);
  }

  @Delete()
  unregister(@Body() dto: PushDeviceDto, @CurrentUser('id') userId: string) {
    return this.push.unregister(userId, dto.token);
  }
}

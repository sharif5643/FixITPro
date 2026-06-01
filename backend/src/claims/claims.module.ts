import { Module } from '@nestjs/common';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  controllers: [ClaimsController],
  providers: [ClaimsService, PermissionGuard],
  exports: [ClaimsService],
})
export class ClaimsModule {}

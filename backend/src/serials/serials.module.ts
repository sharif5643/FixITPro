import { Module } from '@nestjs/common';
import { SerialsController } from './serials.controller';
import { SerialsService } from './serials.service';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  controllers: [SerialsController],
  providers: [SerialsService, PermissionGuard],
  exports: [SerialsService],
})
export class SerialsModule {}

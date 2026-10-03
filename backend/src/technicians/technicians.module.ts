import { Module } from '@nestjs/common';
import { TechniciansController } from './technicians.controller';
import { TechniciansService } from './technicians.service';
import { CommissionModule } from '../commission/commission.module';

@Module({
  imports:     [CommissionModule],
  controllers: [TechniciansController],
  providers:   [TechniciansService],
  exports:     [TechniciansService],
})
export class TechniciansModule {}

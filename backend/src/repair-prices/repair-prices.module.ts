import { Module } from '@nestjs/common';
import { RepairPricesController } from './repair-prices.controller';
import { RepairPricesService } from './repair-prices.service';

@Module({
  controllers: [RepairPricesController],
  providers:   [RepairPricesService],
})
export class RepairPricesModule {}

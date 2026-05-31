import { Module } from '@nestjs/common';
import { CarrierWalletController } from './carrier-wallet.controller';
import { CarrierWalletService } from './carrier-wallet.service';

@Module({
  controllers: [CarrierWalletController],
  providers:   [CarrierWalletService],
  exports:     [CarrierWalletService],
})
export class CarrierWalletModule {}

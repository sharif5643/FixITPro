import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { AccountingModule } from '../accounting/accounting.module';
import { CarrierWalletController } from './carrier-wallet.controller';
import { CarrierWalletService } from './carrier-wallet.service';

@Module({
  imports:     [JournalModule, AccountingModule],
  controllers: [CarrierWalletController],
  providers:   [CarrierWalletService],
  exports:     [CarrierWalletService],
})
export class CarrierWalletModule {}

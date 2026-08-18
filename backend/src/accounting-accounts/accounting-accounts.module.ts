import { Module } from '@nestjs/common';
import { AccountingAccountsService } from './accounting-accounts.service';
import { AccountingAccountsController } from './accounting-accounts.controller';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  controllers: [AccountingAccountsController],
  providers:   [AccountingAccountsService, RolesGuard],
  exports:     [AccountingAccountsService],
})
export class AccountingAccountsModule {}

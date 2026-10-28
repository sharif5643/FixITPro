import { Module } from '@nestjs/common'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { PublicRegisterController } from './public-register.controller'
import { PublicRegisterService } from './public-register.service'
import { PublicPlansController } from './public-plans.controller'

@Module({
  imports: [AuditLogModule],
  controllers: [PublicRegisterController, PublicPlansController],
  providers: [PublicRegisterService],
})
export class PublicRegisterModule {}

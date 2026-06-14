import { Module } from '@nestjs/common'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { PublicRegisterController } from './public-register.controller'
import { PublicRegisterService } from './public-register.service'

@Module({
  imports: [AuditLogModule],
  controllers: [PublicRegisterController],
  providers: [PublicRegisterService],
})
export class PublicRegisterModule {}

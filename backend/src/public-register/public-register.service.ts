import { ConflictException, Injectable } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { Request } from 'express'
import { AuditLogService } from '../audit-log/audit-log.service'
import { PrismaService } from '../database/prisma.service'
import { PublicRegisterDto } from './dto/public-register.dto'

@Injectable()
export class PublicRegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async register(dto: PublicRegisterDto, req?: Request) {
    const ipAddress = req?.ip ?? null
    const userAgent = req?.headers['user-agent'] ?? null

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (!existing) {
      const existingTenant = await this.prisma.tenant.findUnique({ where: { email: dto.email } })
      if (existingTenant) {
        throw new ConflictException('อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น')
      }
    } else {
      throw new ConflictException('อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น')
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12)
    const now = new Date()
    const expiryDate = new Date(now)
    expiryDate.setDate(expiryDate.getDate() + 30)

    const notes = JSON.stringify({
      businessType: dto.businessType ?? null,
      themeColor: dto.themeColor ?? null,
      themePreset: dto.themePreset ?? null,
    })

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          shopName: dto.shopName,
          ownerName: dto.ownerName,
          phone: dto.phone ?? null,
          email: dto.email,
          status: 'ACTIVE',
          plan: 'TRIAL',
          startDate: now,
          expiryDate,
          notes,
        },
      })

      const branch = await tx.branch.create({
        data: {
          name: 'สาขาหลัก',
          isDefault: true,
          isActive: true,
          status: 'ACTIVE',
        },
      })

      const user = await tx.user.create({
        data: {
          email: dto.email,
          name: dto.ownerName,
          phone: dto.phone ?? null,
          password: hashedPassword,
          role: 'OWNER',
          isActive: true,
          tenantId: tenant.id,
          branchId: branch.id,
        },
      })

      await tx.tenantRenewal.create({
        data: {
          action: 'TRIAL_STARTED',
          plan: 'TRIAL',
          duration: 30,
          expiryDate,
          note: 'สมัครทดลองใช้งาน 30 วัน',
          tenantId: tenant.id,
        },
      })

      return { tenant, user }
    })

    void this.auditLog.log({
      actorId: result.user.id,
      actorName: result.user.name,
      action: 'TENANT_REGISTERED',
      entityType: 'Tenant',
      entityId: result.tenant.id,
      afterData: { shopName: dto.shopName, email: dto.email, plan: 'TRIAL' },
      ipAddress: typeof ipAddress === 'string' ? ipAddress : null,
      userAgent: typeof userAgent === 'string' ? userAgent : null,
    })

    void this.auditLog.log({
      actorId: result.user.id,
      actorName: result.user.name,
      action: 'OWNER_CREATED',
      entityType: 'User',
      entityId: result.user.id,
      afterData: { email: dto.email, role: 'OWNER', tenantId: result.tenant.id },
      ipAddress: typeof ipAddress === 'string' ? ipAddress : null,
      userAgent: typeof userAgent === 'string' ? userAgent : null,
    })

    return {
      message: 'สมัครสำเร็จ ยินดีต้อนรับสู่ FixITPro',
      email: dto.email,
      tenantId: result.tenant.id,
    }
  }
}

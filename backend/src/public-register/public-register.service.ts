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
    expiryDate.setDate(expiryDate.getDate() + 14) // Phase 17: 14-day trial

    const notes = JSON.stringify({
      businessType: dto.businessType ?? null,
      themeColor: dto.themeColor ?? null,
      themeKey: dto.themeKey ?? null,
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
          tenantId: tenant.id,
        },
      })

      await tx.shopSettings.create({
        data: {
          shopName: dto.shopName,
          // The phone given at sign-up is the shop's phone on receipts (the setup list asked for it again)
          shopPhone: dto.phone ?? null,
          tenantId: tenant.id,
          // What the owner picked on the sign-up page is the shop's look from the first login
          themeKey:    dto.themeKey ?? null,
          themePreset: dto.themePreset ?? null,
          logoUrl:     dto.logoDataUrl ?? null,
        },
      })

      // Ready-made product types and categories for the kind of shop, so the first product can be
      // added straight away (a new shop had none and had to build them before adding anything)
      for (const t of starterCategories(dto.businessType)) {
        const type = await tx.categoryType.create({ data: { name: t.name, slug: t.slug, tenantId: tenant.id } });
        await tx.category.createMany({
          data: t.categories.map(([slug, name]) => ({ name, slug, categoryTypeId: type.id, tenantId: tenant.id })),
        });
      }

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
          duration: 14, // Phase 17: 14-day trial
          expiryDate,
          note: 'สมัครทดลองใช้งาน 14 วัน',
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

type StarterType = { slug: string; name: string; categories: [string, string][] };

const STARTER: Record<'phone' | 'accessory' | 'part', StarterType> = {
  phone: { slug: 'phone', name: 'มือถือ', categories: [['phone-new', 'มือถือใหม่'], ['phone-used', 'มือถือมือสอง']] },
  accessory: {
    slug: 'accessory', name: 'อุปกรณ์เสริม',
    categories: [['acc-film', 'ฟิล์ม / กระจก'], ['acc-case', 'เคส'], ['acc-charger', 'สายชาร์จ / หัวชาร์จ'], ['acc-audio', 'หูฟัง / ลำโพง']],
  },
  part: {
    slug: 'part', name: 'อะไหล่',
    categories: [['part-screen', 'จอ'], ['part-battery', 'แบตเตอรี่'], ['part-other', 'อะไหล่อื่นๆ']],
  },
};

/** The starter product types for a shop of this kind (all of them when it is not said). */
export function starterCategories(businessType?: string | null): StarterType[] {
  switch (businessType) {
    case 'mobile_repair': return [STARTER.part, STARTER.accessory];
    case 'mobile_shop':   return [STARTER.phone, STARTER.accessory];
    case 'accessories':   return [STARTER.accessory];
    default:              return [STARTER.phone, STARTER.accessory, STARTER.part];
  }
}


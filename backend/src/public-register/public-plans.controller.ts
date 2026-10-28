import { Controller, Get, UseGuards } from '@nestjs/common'
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { PrismaService } from '../database/prisma.service'
import { PLAN_LIMITS } from '../plan-limits/plan-limits.service'
import { RENEW_TERMS, SELF_RENEW_PLANS } from '../subscription/subscription-payments.service'

/** Plans shown on the website: what is actually sold, at the prices the Super Admin set */
export const PUBLIC_PLANS = [...SELF_RENEW_PLANS, 'PRIVATE'] as const
const TRIAL_DAYS = 14

@SkipThrottle({ default: true, auth_login: true, auth_register: true, auth_change_pwd: true })
@UseGuards(ThrottlerGuard)
@Throttle({ public_tracking: { limit: 120, ttl: 60 * 1000 } })
@Controller('public/plans')
export class PublicPlansController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async plans() {
    const keys: string[] = ['TRIAL', ...PUBLIC_PLANS]
    const [packages, links, modules] = await Promise.all([
      this.prisma.package.findMany({
        where:   { key: { in: keys }, isActive: true },
        select:  { key: true, name: true, description: true, price: true, sortOrder: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.packageModule.findMany({ where: { packageKey: { in: keys } }, select: { packageKey: true, moduleKey: true } }),
      this.prisma.appModule.findMany({ where: { isActive: true }, select: { key: true, name: true } }),
    ])
    const name = new Map(modules.map((m) => [m.key, m.name]))
    const modulesOf = (key: string) => links
      .filter((l) => l.packageKey === key && name.has(l.moduleKey))
      .map((l) => ({ key: l.moduleKey, name: name.get(l.moduleKey)! }))
    const limits = (key: string) => {
      const l = PLAN_LIMITS[key as keyof typeof PLAN_LIMITS]
      return {
        branches:  l && isFinite(l.branches) ? l.branches : null,          // null = no limit
        storageGb: l && isFinite(l.storageBytes) ? Math.round(l.storageBytes / 1024 ** 3) : null,
      }
    }
    const trial = packages.find((p) => p.key === 'TRIAL')
    return {
      trial: { days: TRIAL_DAYS, ...limits('TRIAL'), modules: modulesOf('TRIAL'), name: trial?.name ?? null },
      plans: packages
        .filter((p) => p.key !== 'TRIAL')
        .map((p) => ({
          key:         p.key,
          name:        p.name,
          description: p.description,
          // PRIVATE is agreed per shop; others show the Super Admin's price (null while not set)
          monthlyPrice: p.key === 'PRIVATE' || p.price == null ? null : Number(p.price),
          custom:      p.key === 'PRIVATE',
          ...limits(p.key),
          modules:     modulesOf(p.key),
        })),
      terms: RENEW_TERMS.map((t) => ({ months: t.months, discountPct: t.discountPct })),
    }
  }
}

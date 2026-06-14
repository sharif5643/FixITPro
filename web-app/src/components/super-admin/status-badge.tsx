import { cn } from '@/lib/utils'
import type { TenantStatus, TenantPlan, PaymentStatus } from '@/types'

// ── Tenant Status ─────────────────────────────────────────────────────────────

const TENANT_STATUS_CFG: Record<TenantStatus, { label: string; cls: string; dot: string }> = {
  ACTIVE:    { label: 'ใช้งานอยู่',   cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
  PENDING:   { label: 'รอเปิดใช้',   cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20',   dot: 'bg-amber-400' },
  SUSPENDED: { label: 'ถูกระงับ',    cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20', dot: 'bg-orange-400' },
  EXPIRED:   { label: 'หมดอายุ',     cls: 'bg-red-500/10 text-red-400 border-red-500/20',          dot: 'bg-red-400' },
}

export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  const cfg = TENANT_STATUS_CFG[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium', cfg.cls)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  )
}

// ── Plan Badge ────────────────────────────────────────────────────────────────

const PLAN_CFG: Record<TenantPlan, { label: string; cls: string }> = {
  TRIAL:      { label: 'Trial',      cls: 'bg-slate-700 text-slate-300' },
  BASIC:      { label: 'Basic',      cls: 'bg-blue-900/60 text-blue-300 border border-blue-700/40' },
  PRO:        { label: 'Pro',        cls: 'bg-violet-900/60 text-violet-300 border border-violet-700/40' },
  ENTERPRISE: { label: 'Enterprise', cls: 'bg-amber-900/60 text-amber-300 border border-amber-700/40' },
}

export function PlanBadge({ plan }: { plan: TenantPlan }) {
  const cfg = PLAN_CFG[plan]
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold', cfg.cls)}>
      {cfg.label}
    </span>
  )
}

// ── Payment Status Badge ──────────────────────────────────────────────────────

const PAYMENT_STATUS_CFG: Record<PaymentStatus, { label: string; cls: string; dot: string }> = {
  PENDING:  { label: 'รอตรวจสอบ',    cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20',   dot: 'bg-amber-400' },
  VERIFIED: { label: 'ตรวจสอบแล้ว', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
  REJECTED: { label: 'ปฏิเสธ',       cls: 'bg-red-500/10 text-red-400 border-red-500/20',          dot: 'bg-red-400' },
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const cfg = PAYMENT_STATUS_CFG[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium', cfg.cls)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  )
}

// ── Generic Coming Soon Badge ─────────────────────────────────────────────────

export function ComingSoonBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 text-[10px] font-semibold uppercase tracking-wide">
      Coming Soon
    </span>
  )
}

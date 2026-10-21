'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import api from '@/lib/api'
import type { Tenant } from '@/types'

interface PackageRow { key: string; name: string; price: number | string | null; isActive: boolean }
interface SettingsRes { shop?: { promptpayId?: string | null; renewalBankInfo?: string | null } | null }

/**
 * Before a shop can renew: the plans shops are on need a price, and the renewal page needs an
 * account to pay into (audit 2026-10: no package had a price and no account was set).
 */
export function BillingReadiness({ tenants }: { tenants: Tenant[] }) {
  const { data: packages = [] } = useQuery<PackageRow[]>({
    queryKey: ['sa-packages'],
    queryFn: () => api.get('/super-admin/modules/packages').then((r) => r.data),
  })
  const { data: settings } = useQuery<SettingsRes>({
    queryKey: ['sa-settings'],
    queryFn: () => api.get('/super-admin/settings').then((r) => r.data),
  })
  if (!settings) return null

  const inUse = new Set(tenants.filter((t) => t.status !== 'SUSPENDED').map((t) => String(t.plan).toUpperCase()))
  const noPrice = packages.filter((p) => p.isActive && p.key !== 'TRIAL' && inUse.has(p.key.toUpperCase())
    && (p.price == null || Number(p.price) <= 0))
  const noAccount = !settings.shop?.promptpayId && !settings.shop?.renewalBankInfo
  if (noPrice.length === 0 && !noAccount) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
        <CheckCircle2 className="h-4 w-4" /> พร้อมรับค่าบริการ — ตั้งราคาแพ็กเกจและบัญชีรับเงินแล้ว
      </p>
    )
  }
  return (
    <div className="rounded-xl border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-200 space-y-1.5">
      <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> ร้านยังต่ออายุ / จ่ายค่าบริการไม่ได้</p>
      {noPrice.length > 0 && (
        <p>
          แพ็กเกจที่มีร้านใช้อยู่แต่ยังไม่มีราคา: <b>{noPrice.map((p) => p.name).join(', ')}</b> —{' '}
          <Link href="/super-admin/packages" className="underline font-semibold">ตั้งราคา</Link>
        </p>
      )}
      {noAccount && (
        <p>
          ยังไม่มีพร้อมเพย์ / บัญชีธนาคารสำหรับรับเงิน —{' '}
          <Link href="/super-admin/settings" className="underline font-semibold">ตั้งบัญชีรับชำระ</Link>
        </p>
      )}
    </div>
  )
}

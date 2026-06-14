'use client'

import { useAuthStore } from '@/store/auth.store'
import { Lock, TrendingUp } from 'lucide-react'
import Link from 'next/link'

const MODULE_META: Record<string, {
  label: string
  description: string
  plan: string
  planLabel: string
}> = {
  pos:             { label: 'ขายสินค้า (POS)',       description: 'ระบบขายสินค้าหน้าร้าน Point of Sale',      plan: 'TRIAL',      planLabel: 'ทดลองใช้'        },
  repair:          { label: 'งานซ่อม',               description: 'รับซ่อม, รับประกัน, เคลมสินค้า, ช่าง',  plan: 'TRIAL',      planLabel: 'ทดลองใช้'        },
  stock:           { label: 'คลังสินค้า',            description: 'สินค้า, สต็อก, Serial/IMEI, บาร์โค้ด',   plan: 'TRIAL',      planLabel: 'ทดลองใช้'        },
  crm:             { label: 'ลูกค้าสัมพันธ์ (CRM)', description: 'ระบบลูกค้า, ติดตาม, ประวัติการซื้อ',     plan: 'BASIC',      planLabel: 'เบสิก'            },
  report:          { label: 'รายงาน',                description: 'รายงาน, วิเคราะห์ข้อมูลเชิงลึก',         plan: 'BASIC',      planLabel: 'เบสิก'            },
  finance:         { label: 'การเงิน',               description: 'ค่าใช้จ่าย, ซัพพลายเออร์, สั่งซื้อ',    plan: 'PRO',        planLabel: 'โปร'              },
  line_notify:     { label: 'แจ้งเตือน LINE',        description: 'ส่งแจ้งเตือนอัตโนมัติผ่าน LINE',         plan: 'PRO',        planLabel: 'โปร'              },
  user_management: { label: 'จัดการผู้ใช้',          description: 'พนักงาน, บทบาท, สาขา, สิทธิ์',          plan: 'ENTERPRISE', planLabel: 'เอ็นเตอร์ไพรส์'  },
}

interface ModuleGateProps {
  module: string
  children: React.ReactNode
}

export function ModuleGate({ module, children }: ModuleGateProps) {
  const hasModule = useAuthStore((s) => s.hasModule)

  if (hasModule(module)) return <>{children}</>

  const meta = MODULE_META[module] ?? {
    label: module,
    description: 'ฟีเจอร์นี้ไม่รวมในแพ็กเกจปัจจุบัน',
    plan: 'PRO',
    planLabel: 'โปร',
  }

  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">

        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
          <Lock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            ฟีเจอร์ {meta.label}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {meta.description}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            ไม่รวมอยู่ในแพ็กเกจปัจจุบันของท่าน
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 dark:border-amber-800/60 dark:bg-amber-900/20">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            ต้องการแพ็กเกจ{' '}
            <span className="font-bold">{meta.planLabel}</span>
            {' '}ขึ้นไปเพื่อใช้งานฟีเจอร์นี้
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/subscription"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <TrendingUp className="h-4 w-4" />
            อัปเกรดแพ็กเกจ
          </Link>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            ย้อนกลับ
          </button>
        </div>

      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Wrench, Clock, ShoppingCart, Package, LogOut, Printer, Timer, Wifi, BarChart2, BookOpen, Receipt } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { formatThaiMoney } from '@/lib/utils'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import api from '@/lib/api'
import { MobileBottomNav } from '@/components/sunmi/mobile-bottom-nav'
import type { ShopSettings } from '@/types'

const MENUS = [
  {
    href:    '/sunmi/repair-intake',
    icon:    Wrench,
    label:   'รับงานซ่อม',
    desc:    'สร้างงานซ่อมใหม่',
    bg:      'bg-blue-600',
    cardBg:  'bg-blue-50',
    text:    'text-blue-700',
  },
  {
    href:    '/sunmi/repairs',
    icon:    Clock,
    label:   'งานซ่อมค้าง',
    desc:    'ดู / อัพเดท / รับชำระ',
    bg:      'bg-amber-500',
    cardBg:  'bg-amber-50',
    text:    'text-amber-700',
  },
  {
    href:    '/sunmi/sales',
    icon:    ShoppingCart,
    label:   'ขายสินค้า',
    desc:    'สแกนบาร์โค้ด / คิดเงิน',
    bg:      'bg-green-600',
    cardBg:  'bg-green-50',
    text:    'text-green-700',
  },
  {
    href:    '/sunmi/stock',
    icon:    Package,
    label:   'จัดการสต็อก',
    desc:    'ตรวจ / เพิ่ม / สร้างสินค้า',
    bg:      'bg-purple-600',
    cardBg:  'bg-purple-50',
    text:    'text-purple-700',
  },
  {
    href:    '/sunmi/sim-sales',
    icon:    Wifi,
    label:   'ขาย SIM / เน็ต',
    desc:    'เติมเน็ต / ซิมการ์ด',
    bg:      'bg-cyan-600',
    cardBg:  'bg-cyan-50',
    text:    'text-cyan-700',
  },
  {
    href:    '/sunmi/dashboard',
    icon:    BarChart2,
    label:   'แดชบอร์ด',
    desc:    'ยอดขาย / บิล / สรุปวันนี้',
    bg:      'bg-rose-600',
    cardBg:  'bg-rose-50',
    text:    'text-rose-700',
  },
]

export default function SunmiHomePage() {
  const router      = useRouter()
  const user        = useAuthStore((s) => s.user)
  const clearAuth   = useAuthStore((s) => s.clearAuth)
  const isOwnerOrMgr = user?.role === 'OWNER' || user?.role === 'MANAGER'

  const { data: settings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn:  async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

  const { data: currentShift } = useQuery<{ id: string; openedAt: string; totalSales?: number; salesCount?: number } | null>({
    queryKey:  ['shifts', 'current'],
    queryFn:   async () => (await api.get('/shifts/current')).data,
    staleTime: 30_000,
  })

  function handleLogout() {
    clearAuth()
    router.replace('/login')
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 select-none">
      {/* Header */}
      <div className="px-5 pt-8 pb-6">
        <p className="text-slate-400 text-xs font-semibold tracking-widest uppercase">FixITPro POS</p>
        <h1 className="text-white text-2xl font-bold mt-1">
          {settings?.shopName ?? 'ร้านซ่อม'}
        </h1>
        {settings?.shopSubtitle && (
          <p className="text-slate-400 text-sm mt-0.5">{settings.shopSubtitle}</p>
        )}
        <p className="text-slate-500 text-sm mt-2">สวัสดี, {user?.name}</p>
      </div>

      {/* Menu cards */}
      <div className="flex-1 bg-slate-100 rounded-t-3xl px-4 pt-6 pb-6">
        <div className="grid grid-cols-2 gap-3 mb-3">
          {MENUS.map((m) => {
            const Icon = m.icon
            return (
              <Link
                key={m.href}
                href={m.href}
                className={`flex flex-col items-start p-5 rounded-2xl ${m.cardBg} active:scale-95 transition-transform`}
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${m.bg} mb-3 shadow-sm`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <p className={`font-bold text-base leading-tight ${m.text}`}>{m.label}</p>
                <p className="text-slate-500 text-xs mt-1 leading-tight">{m.desc}</p>
              </Link>
            )
          })}
        </div>

        {/* Daily summary card — owner/manager only */}
        {isOwnerOrMgr && (
          <Link
            href="/sunmi/daily-summary"
            className="flex items-center gap-3 px-4 py-3.5 rounded-2xl mb-3 active:scale-95 transition-transform bg-rose-50 border border-rose-200"
          >
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-rose-600">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-rose-800 text-sm">สรุปปิดวัน</p>
              <p className="text-xs text-rose-600 mt-0.5">รายได้ · งานซ่อม · แจ้งเตือน</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 bg-rose-600 text-white">
              ดู
            </span>
          </Link>
        )}

        {/* Expense card — owner/manager only */}
        {isOwnerOrMgr && (
          <Link
            href="/sunmi/expenses"
            className="flex items-center gap-3 px-4 py-3.5 rounded-2xl mb-3 active:scale-95 transition-transform bg-orange-50 border border-orange-200"
          >
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-orange-500">
              <Receipt className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-orange-800 text-sm">ค่าใช้จ่าย</p>
              <p className="text-xs text-orange-600 mt-0.5">บันทึก / ดูรายการ / ยกเลิก</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 bg-orange-500 text-white">
              บันทึก
            </span>
          </Link>
        )}

        {/* Shift status card */}
        <Link
          href="/sunmi/shifts"
          className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl mb-3 active:scale-95 transition-transform ${
            currentShift ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
          }`}
        >
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
            currentShift ? 'bg-green-600' : 'bg-amber-500'
          }`}>
            <Timer className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            {currentShift ? (
              <>
                <p className="font-bold text-green-800 text-sm">กะเปิดอยู่</p>
                <p className="text-xs text-green-600 mt-0.5">
                  เปิดตั้งแต่ {format(new Date(currentShift.openedAt), 'HH:mm', { locale: th })} น.
                  {currentShift.totalSales != null && ` · ยอดขาย ${formatThaiMoney(currentShift.totalSales)}`}
                </p>
              </>
            ) : (
              <>
                <p className="font-bold text-amber-800 text-sm">ยังไม่ได้เปิดกะ</p>
                <p className="text-xs text-amber-600 mt-0.5">แตะเพื่อเปิดกะ</p>
              </>
            )}
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
            currentShift ? 'bg-green-600 text-white' : 'bg-amber-500 text-white'
          }`}>
            {currentShift ? 'ปิดกะ' : 'เปิดกะ'}
          </span>
        </Link>

        {/* Utility row: printer test + logout */}
        <div className="flex gap-2">
          <Link
            href="/sunmi/printer-test"
            className="flex items-center justify-center gap-2 py-4 px-4 rounded-2xl bg-white border border-slate-200 active:bg-slate-50 transition-colors"
          >
            <Printer className="h-5 w-5 text-slate-400" />
            <span className="text-slate-600 font-medium text-sm">ทดสอบพิมพ์</span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl bg-white border border-slate-200 active:bg-slate-50 transition-colors"
          >
            <LogOut className="h-5 w-5 text-slate-400" />
            <span className="text-slate-600 font-medium">ออกจากระบบ</span>
          </button>
        </div>
      </div>

      {/* Persistent bottom nav */}
      <MobileBottomNav />
    </div>
  )
}

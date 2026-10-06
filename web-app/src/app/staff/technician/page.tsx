'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, Bell, Plus } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { MyRepairsBoard } from '@/components/repairs/my-repairs-board'

export default function TechnicianPage() {
  const router = useRouter()
  const user   = useAuthStore((s) => s.user)
  const initials = user?.name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() ?? '?'

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FB] pb-28">
      {/* Header */}
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <div className="flex flex-1 items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-yellow text-xs font-bold text-brand-on-yellow">
              {initials}
            </div>
            <div>
              <p className="text-xs font-bold text-brand-black">{user?.name}</p>
              <p className="text-[10px] text-slate-400">งานซ่อมของฉัน</p>
            </div>
          </div>
          <button onClick={() => router.push('/staff/notifications')} aria-label="การแจ้งเตือน">
            <Bell className="h-5 w-5 text-slate-400" />
          </button>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4">
        <MyRepairsBoard openJob={(id) => router.push(`/staff/repairs/${id}`)} />
      </div>

      {/* Floating button */}
      <button
        onClick={() => router.push('/staff/create')}
        className="fixed bottom-24 right-5 flex h-14 items-center gap-2 rounded-2xl bg-brand-yellow px-5 font-bold text-brand-on-yellow shadow-[0_4px_20px_rgb(var(--brand-accent)/0.5)]"
      >
        <Plus className="h-5 w-5" /> รับงานใหม่
      </button>
    </div>
  )
}

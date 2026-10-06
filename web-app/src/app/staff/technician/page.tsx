'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Wrench, Bell, ChevronRight, Loader2, Plus, Hand } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth.store'
import { REPAIR_LABEL } from '@/components/ui/status-badge'
import type { Repair } from '@/types'
import api from '@/lib/api'

// Quick next steps a technician takes from the list; the rest happens on the job page.
// Every target here is an allowed transition in the backend's repair status flow.
const QUICK_ACTIONS: Record<string, { label: string; to: string; primary?: boolean }[]> = {
  RECEIVED:      [{ label: 'เริ่มตรวจเช็ก', to: 'DIAGNOSING' }],
  DIAGNOSING:    [{ label: 'เริ่มซ่อม', to: 'IN_PROGRESS' }],
  APPROVED:      [{ label: 'เริ่มซ่อม', to: 'IN_PROGRESS' }],
  WAITING_PARTS: [{ label: 'อะไหล่มาแล้ว เริ่มซ่อม', to: 'IN_PROGRESS' }],
  IN_PROGRESS:   [{ label: 'รออะไหล่', to: 'WAITING_PARTS' }, { label: 'ซ่อมเสร็จ', to: 'COMPLETED', primary: true }],
}

const S_COLOR: Record<string, string> = {
  RECEIVED: 'bg-blue-50 text-blue-600', DIAGNOSING: 'bg-yellow-50 text-yellow-700',
  WAITING_APPROVAL: 'bg-amber-50 text-amber-700', APPROVED: 'bg-teal-50 text-teal-700',
  IN_PROGRESS: 'bg-purple-50 text-purple-600', WAITING_PARTS: 'bg-orange-50 text-orange-600',
  QC_PENDING: 'bg-indigo-50 text-indigo-600', COMPLETED: 'bg-green-50 text-green-600',
  READY_PICKUP: 'bg-emerald-50 text-emerald-600',
}

type Tab = 'mine' | 'open'

export default function TechnicianPage() {
  const router = useRouter()
  const user   = useAuthStore((s) => s.user)
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId,  setBusyId]  = useState<string | null>(null)
  const [tab,     setTab]     = useState<Tab>('mine')

  function loadData() {
    api.get('/repairs?activeOnly=true')
      .then((r) => {
        const list = r.data?.data ?? r.data ?? []
        setRepairs(Array.isArray(list) ? list : [])
      })
      .catch(() => toast.error('โหลดงานไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { loadData() }, [])

  // Jobs given to this technician, and jobs nobody has taken yet
  const mine = repairs.filter((r) => r.technician?.id === user?.id)
  // A finished job waiting for the customer is not work to pick up
  const open = repairs.filter((r) => !r.technician && !['COMPLETED', 'READY_PICKUP'].includes(r.status))
  const list = tab === 'mine' ? mine : open

  async function patch(id: string, body: Record<string, unknown>, ok: string) {
    setBusyId(id)
    try {
      await api.patch(`/repairs/${id}`, body)
      toast.success(ok)
      loadData()
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'บันทึกไม่สำเร็จ')
    } finally {
      setBusyId(null)
    }
  }

  const initials = user?.name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() ?? '?'
  const count = (statuses: string[]) => mine.filter((r) => statuses.includes(r.status)).length

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
              <p className="text-[10px] text-slate-400">ช่างเทคนิค</p>
            </div>
          </div>
          <button onClick={() => router.push('/staff/notifications')} aria-label="การแจ้งเตือน">
            <Bell className="h-5 w-5 text-slate-400" />
          </button>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {/* My workload */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'ยังไม่เริ่ม', val: count(['RECEIVED', 'DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED']), bg: 'bg-blue-50',    text: 'text-blue-600' },
            { label: 'กำลังซ่อม',  val: count(['IN_PROGRESS', 'QC_PENDING']),                             bg: 'bg-purple-50',  text: 'text-purple-600' },
            { label: 'รออะไหล่',   val: count(['WAITING_PARTS']),                                          bg: 'bg-orange-50',  text: 'text-orange-600' },
            { label: 'เสร็จ รอส่ง', val: count(['COMPLETED', 'READY_PICKUP']),                             bg: 'bg-emerald-50', text: 'text-emerald-600' },
          ].map((s) => (
            <div key={s.label} className={`flex flex-col items-center gap-1 rounded-2xl ${s.bg} p-3`}>
              <p className={`text-2xl font-extrabold ${s.text}`}>{loading ? '–' : s.val}</p>
              <p className={`text-[9px] font-semibold text-center leading-tight ${s.text}`}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-1 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          {([['mine', 'งานของฉัน', mine.length], ['open', 'งานกลาง (ยังไม่มีช่าง)', open.length]] as const).map(([key, label, n]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-xl py-2 text-xs font-bold transition-colors ${tab === key ? 'bg-brand-black text-white' : 'text-slate-500'}`}
            >
              {label} {!loading && <span className="opacity-70">({n})</span>}
            </button>
          ))}
        </div>

        {/* Job list */}
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-brand-yellow" /></div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white py-12 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <Wrench className="h-10 w-10 text-slate-200" />
            <p className="text-sm text-slate-400">{tab === 'mine' ? 'ยังไม่มีงานที่มอบหมายให้คุณ' : 'ไม่มีงานกลางรอช่าง'}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {list.map((r) => (
              <div key={r.id} className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                <div className="mb-2.5 flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-yellow/10">
                    <Wrench className="h-5 w-5 text-brand-yellow" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-400">{r.ticketNumber}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${S_COLOR[r.status] ?? 'bg-slate-100 text-slate-500'}`}>
                        {REPAIR_LABEL[r.status] ?? r.status}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-brand-black">{r.deviceBrand} {r.deviceModel}</p>
                    <p className="text-xs text-slate-400 truncate">{r.customer?.name ?? 'ไม่ระบุลูกค้า'}{r.issue ? ` · ${r.issue}` : ''}</p>
                  </div>
                  <button onClick={() => router.push(`/staff/repairs/${r.id}`)} aria-label="เปิดงาน">
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </button>
                </div>

                {tab === 'open' ? (
                  <button
                    disabled={busyId === r.id}
                    onClick={() => patch(r.id, { technicianId: user?.id }, 'รับงานแล้ว — อยู่ในงานของฉัน')}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-yellow py-2 text-xs font-bold text-brand-on-yellow disabled:opacity-50"
                  >
                    <Hand className="h-3.5 w-3.5" /> รับงานนี้
                  </button>
                ) : QUICK_ACTIONS[r.status] && (
                  <div className="flex gap-2">
                    {QUICK_ACTIONS[r.status].map((a) => (
                      <button
                        key={a.to}
                        disabled={busyId === r.id}
                        onClick={() => patch(r.id, { status: a.to }, `${REPAIR_LABEL[a.to] ?? a.label} แล้ว`)}
                        className={`flex-1 rounded-xl py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                          a.primary ? 'bg-brand-yellow text-brand-on-yellow' : 'bg-brand-black text-white'
                        }`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
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

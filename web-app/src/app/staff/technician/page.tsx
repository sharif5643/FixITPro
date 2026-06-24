'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Wrench, Bell, ChevronRight, Loader2, Plus } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'

interface Repair {
  id:string; ticketNumber:string; status:string
  customerName:string; deviceBrand:string; deviceModel:string
  issueTitle?:string; createdAt:string
}

const STATUS_ACTIONS: Record<string,string[]> = {
  PENDING:     ['รับงาน'],
  IN_PROGRESS: ['รออะไหล่','เสร็จแล้ว'],
  WAIT_PARTS:  ['เริ่มซ่อมต่อ'],
  WAIT_PICKUP: ['ส่งมอบแล้ว'],
}
const NEXT_STATUS: Record<string,string> = {
  'รับงาน':'IN_PROGRESS','รออะไหล่':'WAIT_PARTS','เสร็จแล้ว':'WAIT_PICKUP',
  'เริ่มซ่อมต่อ':'IN_PROGRESS','ส่งมอบแล้ว':'COMPLETED',
}
const S_COLOR: Record<string,string> = {
  PENDING:'bg-blue-50 text-blue-600', IN_PROGRESS:'bg-amber-50 text-amber-600',
  WAIT_PARTS:'bg-orange-50 text-orange-600', WAIT_PICKUP:'bg-green-50 text-green-600',
  COMPLETED:'bg-emerald-50 text-emerald-600',
}
const S_LABEL: Record<string,string> = {
  PENDING:'งานใหม่', IN_PROGRESS:'กำลังทำ',
  WAIT_PARTS:'รออะไหล่', WAIT_PICKUP:'รอส่งมอบ', COMPLETED:'เสร็จแล้ว',
}

export default function TechnicianPage() {
  const router = useRouter()
  const user   = useAuthStore((s) => s.user)
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [stats,   setStats]   = useState({new:0, inProgress:0, waitParts:0, done:0})
  const [loading, setLoading] = useState(true)

  function loadData() {
    Promise.all([
      api.get('/repairs?limit=30&activeOnly=true').catch(() => ({data:[]})),
      api.get('/repairs/stats').catch(() => ({data:{}})),
    ]).then(([r,s]) => {
      const list = r.data?.data ?? r.data ?? []
      setRepairs(Array.isArray(list) ? list : [])
      setStats({
        new:        s.data?.pending    ?? 0,
        inProgress: s.data?.inProgress ?? s.data?.active ?? 0,
        waitParts:  s.data?.waitParts  ?? 0,
        done:       s.data?.completed  ?? 0,
      })
    }).finally(() => setLoading(false))
  }
  useEffect(() => { loadData() }, [])

  async function updateStatus(id:string, newStatus:string) {
    try {
      await api.patch(`/repairs/${id}`, {status:newStatus})
      loadData()
    } catch {}
  }

  const initials = user?.name?.split(' ').map((n:string)=>n[0]).slice(0,2).join('').toUpperCase() ?? '?'

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FB] pb-28">
      {/* Header */}
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <div className="flex flex-1 items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-yellow text-xs font-bold text-brand-black">
              {initials}
            </div>
            <div>
              <p className="text-xs font-bold text-brand-black">{user?.name}</p>
              <p className="text-[10px] text-slate-400">ช่างเทคนิค</p>
            </div>
          </div>
          <Bell className="h-5 w-5 text-slate-400" />
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            {label:'งานใหม่',   val:stats.new,        bg:'bg-blue-50',    text:'text-blue-600'},
            {label:'กำลังทำ',  val:stats.inProgress, bg:'bg-amber-50',   text:'text-amber-600'},
            {label:'รออะไหล่', val:stats.waitParts,  bg:'bg-orange-50',  text:'text-orange-600'},
            {label:'เสร็จแล้ว',val:stats.done,       bg:'bg-emerald-50', text:'text-emerald-600'},
          ].map(s => (
            <div key={s.label} className={`flex flex-col items-center gap-1 rounded-2xl ${s.bg} p-3`}>
              <p className={`text-2xl font-extrabold ${s.text}`}>{s.val}</p>
              <p className={`text-[9px] font-semibold text-center leading-tight ${s.text}`}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Job list */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">รายการงานของฉัน</p>
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-brand-yellow" /></div>
          ) : repairs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-white py-12 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <Wrench className="h-10 w-10 text-slate-200" />
              <p className="text-sm text-slate-400">ยังไม่มีงาน</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {repairs.map(r => (
                <div key={r.id} className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                  <div className="mb-2.5 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-yellow/10">
                      <Wrench className="h-5 w-5 text-brand-yellow" strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-slate-400">{r.ticketNumber}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${S_COLOR[r.status] ?? 'bg-slate-100 text-slate-500'}`}>
                          {S_LABEL[r.status] ?? r.status}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-brand-black">{r.deviceBrand} {r.deviceModel}</p>
                      <p className="text-xs text-slate-400">{r.customerName}</p>
                    </div>
                    <button onClick={() => router.push(`/staff/repairs/${r.id}`)}>
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </button>
                  </div>
                  {STATUS_ACTIONS[r.status] && (
                    <div className="flex gap-2">
                      {STATUS_ACTIONS[r.status].map(action => (
                        <button
                          key={action}
                          onClick={() => updateStatus(r.id, NEXT_STATUS[action])}
                          className={`flex-1 rounded-xl py-2 text-xs font-bold transition-colors ${
                            action === 'เสร็จแล้ว' || action === 'ส่งมอบแล้ว'
                              ? 'bg-brand-yellow text-brand-black'
                              : 'bg-brand-black text-white'
                          }`}
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Floating button */}
      <button
        onClick={() => router.push('/staff/create')}
        className="fixed bottom-24 right-5 flex h-14 items-center gap-2 rounded-2xl bg-brand-yellow px-5 font-bold text-brand-black shadow-[0_4px_20px_rgba(255,193,7,0.5)]"
      >
        <Plus className="h-5 w-5" /> รับงานใหม่
      </button>
    </div>
  )
}

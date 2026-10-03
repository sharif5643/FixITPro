'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth } from 'date-fns'
import { Coins, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { formatThaiMoney } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'

type CommissionType = 'NONE' | 'PERCENT_TOTAL' | 'PERCENT_LABOR' | 'FIXED'

interface CommissionReport {
  startDate: string
  endDate: string
  setting: { type: CommissionType; value: number }
  rows: { technicianId: string; name: string; jobs: number; revenue: number; partsCost: number; commission: number }[]
  totals: { jobs: number; revenue: number; commission: number }
}

const TYPE_OPTIONS: { value: CommissionType; label: string; hint: string }[] = [
  { value: 'NONE',          label: 'ไม่ใช้ค่าคอม',            hint: 'ไม่คำนวณค่าคอมช่าง' },
  { value: 'PERCENT_LABOR', label: '% ของ (ราคางาน − อะไหล่)', hint: 'เช่น 30% ของกำไรค่าแรงแต่ละงาน' },
  { value: 'PERCENT_TOTAL', label: '% ของราคางาน',             hint: 'เช่น 10% ของราคาที่ลูกค้าจ่าย' },
  { value: 'FIXED',         label: 'เหมาต่องาน (บาท)',          hint: 'เช่น 100 บาททุกงานที่ส่งมอบ' },
]

export default function TechnicianCommissionPage() {
  const qc = useQueryClient()
  const canEdit = useAuthStore((s) => s.hasPermission('settings.manage'))
  const today = format(new Date(), 'yyyy-MM-dd')
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(today)

  const { data, isLoading } = useQuery<CommissionReport>({
    queryKey: ['technician-commission', startDate, endDate],
    queryFn: async () => (await api.get('/technicians/commission', { params: { startDate, endDate } })).data,
  })

  const [type, setType] = useState<CommissionType>('NONE')
  const [value, setValue] = useState('0')
  useEffect(() => {
    if (data?.setting) { setType(data.setting.type); setValue(String(data.setting.value)) }
  }, [data?.setting?.type, data?.setting?.value]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => api.patch('/settings', { techCommissionType: type, techCommissionValue: Number(value) || 0 }),
    onSuccess: () => {
      toast.success('บันทึกวิธีคิดค่าคอมแล้ว')
      qc.invalidateQueries({ queryKey: ['technician-commission'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'บันทึกไม่สำเร็จ'),
  })

  const isPercent = type.startsWith('PERCENT')

  return (
    <div className="space-y-5">
      <PageHeader
        title="ค่าคอมช่าง"
        icon={Coins}
        subtitle="คำนวณจากงานซ่อมที่ส่งมอบและรับเงินแล้วในช่วงที่เลือก — เป็นรายงานอย่างเดียว ไม่เปลี่ยนตัวเลขกำไร"
      />

      {/* How the shop pays */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">วิธีคิดค่าคอม</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {TYPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={!canEdit}
              onClick={() => setType(o.value)}
              className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed ${
                type === o.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-slate-200 dark:border-slate-700/60 hover:border-blue-300'
              }`}
            >
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{o.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{o.hint}</p>
            </button>
          ))}
        </div>
        {type !== 'NONE' && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-slate-500">{isPercent ? 'เปอร์เซ็นต์' : 'บาทต่องาน'}</label>
              <Input
                type="number" min={0} max={isPercent ? 100 : undefined} step="0.5"
                value={value} disabled={!canEdit}
                onChange={(e) => setValue(e.target.value)}
                className="w-36"
              />
            </div>
          </div>
        )}
        {canEdit ? (
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            บันทึกวิธีคิด
          </Button>
        ) : (
          <p className="text-xs text-slate-500">เจ้าของร้านเป็นผู้ตั้งวิธีคิดค่าคอม</p>
        )}
      </div>

      {/* Period */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="text-xs text-slate-500">ตั้งแต่</label>
          <Input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        </div>
        <div>
          <label className="text-xs text-slate-500">ถึง</label>
          <Input type="date" value={endDate} min={startDate} max={today} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        </div>
      </div>

      {/* Report */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">ช่าง</th>
              <th className="px-4 py-2.5 text-right font-semibold">งานที่ส่งมอบ</th>
              <th className="px-4 py-2.5 text-right font-semibold">ราคางานรวม</th>
              <th className="px-4 py-2.5 text-right font-semibold">ค่าอะไหล่</th>
              <th className="px-4 py-2.5 text-right font-semibold">ค่าคอม</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400"><Loader2 className="inline h-5 w-5 animate-spin" /></td></tr>
            ) : !data || data.rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">ยังไม่มีงานที่ส่งมอบในช่วงนี้</td></tr>
            ) : (
              data.rows.map((r) => (
                <tr key={r.technicianId} className="border-t border-slate-100 dark:border-slate-700/60">
                  <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{r.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.jobs}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatThaiMoney(r.revenue)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{formatThaiMoney(r.partsCost)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                    {data.setting.type === 'NONE' ? '—' : formatThaiMoney(r.commission)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {data && data.rows.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 dark:border-slate-700 font-semibold">
              <tr>
                <td className="px-4 py-2.5">รวม</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{data.totals.jobs}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatThaiMoney(data.totals.revenue)}</td>
                <td />
                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                  {data.setting.type === 'NONE' ? '—' : formatThaiMoney(data.totals.commission)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {data?.setting.type === 'NONE' && (
        <p className="text-xs text-slate-500">เลือกวิธีคิดค่าคอมด้านบน แล้วกดบันทึก เพื่อดูยอดของช่างแต่ละคน</p>
      )}
    </div>
  )
}

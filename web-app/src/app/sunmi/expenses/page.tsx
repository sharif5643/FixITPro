'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { formatThaiMoney } from '@/lib/utils'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import api from '@/lib/api'
import { offlineQueue } from '@/lib/offline-queue'
import { useNetworkStatus } from '@/hooks/use-network-status'
import { toast } from 'sonner'
import { PrinterFlowSheet } from '@/components/sunmi/printer-flow'
import {
  buildExpenseSlipHtml, buildExpenseSlipPreviewData, shareExpenseSlip,
  type PrintExpenseSlipOptions,
} from '@/lib/printer'
import type { Expense, ExpenseCategory, ExpenseSummary, ShopSettings } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const PAYMENT_LABELS = { CASH: 'เงินสด', TRANSFER: 'โอน', CARD: 'บัตร' } as const

const PAYMENT_COLORS = {
  CASH:     'bg-green-100 text-green-700',
  TRANSFER: 'bg-blue-100 text-blue-700',
  CARD:     'bg-purple-100 text-purple-700',
} as const

const PRESETS = [
  { label: 'เติมเงิน AIS',     description: 'เติมเงิน AIS',     categoryCode: 'misc' },
  { label: 'ค่าน้ำมัน',        description: 'ค่าน้ำมัน',        categoryCode: 'shipping' },
  { label: 'ซื้ออะไหล่ด่วน',  description: 'ซื้ออะไหล่ด่วน',  categoryCode: 'maintenance' },
  { label: 'ค่าแรงช่าง',       description: 'ค่าแรงช่าง',       categoryCode: 'salary' },
  { label: 'ค่าเดินทาง',       description: 'ค่าเดินทาง',       categoryCode: 'shipping' },
] as const

function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' })
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SunmiExpensesPage() {
  const router       = useRouter()
  const user         = useAuthStore((s) => s.user)
  const isOwnerOrMgr = user?.role === 'OWNER' || user?.role === 'MANAGER'
  const qc           = useQueryClient()

  const [amount,      setAmount]      = useState('')
  const [categoryId,  setCategoryId]  = useState('')
  const [payMethod,   setPayMethod]   = useState<'CASH' | 'TRANSFER' | 'CARD'>('CASH')
  const [description, setDescription] = useState('')
  const [note,        setNote]        = useState('')

  const [voidId,     setVoidId]     = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [printOpts,  setPrintOpts]  = useState<PrintExpenseSlipOptions | null>(null)

  const { online } = useNetworkStatus()
  const td = todayStr()

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-categories'],
    queryFn:  () => api.get('/expenses/categories').then((r) => r.data),
    staleTime: 60_000,
  })

  const { data: settings } = useQuery<ShopSettings>({
    queryKey:  ['settings'],
    queryFn:   async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

  const activeCategories = useMemo(() => categories.filter((c) => c.isActive), [categories])

  const { data: todaySummary } = useQuery<ExpenseSummary>({
    queryKey: ['expenses-summary-daily', td],
    queryFn:  () => api.get('/expenses/summary/daily', { params: { date: td } }).then((r) => r.data),
    refetchInterval: 30_000,
  })

  const { data: todayList } = useQuery<{ items: Expense[]; total: number }>({
    queryKey: ['expenses-today-list', td],
    queryFn:  () =>
      api.get('/expenses', {
        params: { startDate: td, endDate: td, limit: '10', showVoided: 'false' },
      }).then((r) => r.data),
    refetchInterval: 30_000,
  })

  // ── Mutations ────────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (data: object) => {
      if (!online) {
        await offlineQueue.enqueue('EXPENSE_CREATE', data)
        return { _queued: true as const }
      }
      return api.post('/expenses', data)
    },
    onSuccess: (res: any) => {
      if (res?._queued) {
        toast.success('บันทึกในเครื่องแล้ว จะซิงค์อัตโนมัติเมื่อเชื่อมต่ออินเทอร์เน็ต')
        setAmount('')
        setDescription('')
        setNote('')
        setCategoryId('')
        return
      }
      const expense = res.data as Expense
      toast.success('บันทึกค่าใช้จ่ายแล้ว')
      const catName = activeCategories.find((c) => c.id === expense.categoryId)?.name
        ?? expense.category?.name ?? categoryId
      const opts: PrintExpenseSlipOptions = {
        shopName:      settings?.shopName ?? 'FixITPro',
        shopPhone:     settings?.shopPhone ?? undefined,
        slipNumber:    expense.id.slice(-8).toUpperCase(),
        date:          format(new Date(expense.createdAt), 'dd/MM/yyyy HH:mm', { locale: th }),
        cashierName:   user?.name ?? '',
        description:   expense.description,
        categoryName:  catName,
        amount:        Number(expense.amount),
        paymentMethod: expense.paymentMethod,
        note:          expense.note ?? undefined,
        footer:        settings?.receiptFooter ?? 'ขอบคุณที่ใช้บริการ',
      }
      setAmount('')
      setDescription('')
      setNote('')
      setCategoryId('')
      qc.invalidateQueries({ queryKey: ['expenses-summary-daily'] })
      qc.invalidateQueries({ queryKey: ['expenses-today-list'] })
      setPrintOpts(opts)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message
      toast.error(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/expenses/${id}/void`, { voidReason: reason }),
    onSuccess: () => {
      toast.success('ยกเลิกรายการแล้ว')
      setVoidId(null)
      setVoidReason('')
      qc.invalidateQueries({ queryKey: ['expenses-summary-daily'] })
      qc.invalidateQueries({ queryKey: ['expenses-today-list'] })
    },
    onError: () => toast.error('เกิดข้อผิดพลาด'),
  })

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function applyPreset(preset: typeof PRESETS[number]) {
    setDescription(preset.description)
    const cat = activeCategories.find((c) => c.code === preset.categoryCode)
    if (cat) setCategoryId(cat.id)
  }

  function handleSubmit() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0)    { toast.error('กรุณากรอกจำนวนเงิน');  return }
    if (!categoryId)          { toast.error('กรุณาเลือกหมวดหมู่');  return }
    if (!description.trim())  { toast.error('กรุณากรอกรายละเอียด'); return }
    createMutation.mutate({
      expenseDate:   td,
      amount:        amt,
      description:   description.trim(),
      paymentMethod: payMethod,
      categoryId,
      note:          note.trim() || undefined,
    })
  }

  // ── Permission guard ──────────────────────────────────────────────────────────

  if (!isOwnerOrMgr) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <p className="text-slate-300 text-center px-8">ต้องการสิทธิ์เจ้าของร้านหรือผู้จัดการ</p>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 select-none">

      {/* Header */}
      <div className="px-5 pt-10 pb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-slate-400 mb-5 active:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">กลับ</span>
        </button>

        <h1 className="text-white text-2xl font-bold">ค่าใช้จ่าย</h1>

        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-orange-400 text-xl font-bold">
            {formatThaiMoney(todaySummary?.totalAmount ?? 0)}
          </span>
          <span className="text-slate-400 text-sm">
            วันนี้ · {todaySummary?.count ?? 0} รายการ
          </span>
        </div>

        {(todaySummary?.byCategory ?? []).length > 0 && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {todaySummary!.byCategory.slice(0, 4).map((bc) => (
              <span
                key={bc.categoryId}
                className="text-xs bg-slate-700 text-slate-300 px-2.5 py-1 rounded-full"
              >
                {bc.categoryName} {formatThaiMoney(bc.total)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 bg-slate-100 rounded-t-3xl px-4 pt-5 pb-24 overflow-y-auto">

        {/* Quick presets */}
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">บันทึกด่วน</p>
        <div className="flex gap-2 overflow-x-auto pb-2 mb-5 -mx-4 px-4 scrollbar-none">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="shrink-0 px-4 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold active:scale-95 active:bg-orange-600 transition-transform shadow-sm"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-5 space-y-5">

          {/* Amount */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              จำนวนเงิน (฿)
            </label>
            <input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full text-4xl font-bold text-slate-900 border-b-2 border-slate-200 focus:border-orange-500 outline-none py-2 mt-1 bg-transparent"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-2.5">
              หมวดหมู่
            </label>
            <div className="grid grid-cols-2 gap-2">
              {activeCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryId(cat.id)}
                  className={`px-3 py-3 rounded-xl text-sm font-semibold text-left transition-colors active:scale-95 ${
                    categoryId === cat.id
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Payment method */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-2.5">
              วิธีชำระ
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['CASH', 'TRANSFER', 'CARD'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPayMethod(m)}
                  className={`py-3 rounded-xl text-sm font-bold transition-colors active:scale-95 ${
                    payMethod === m ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {PAYMENT_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              รายละเอียด
            </label>
            <input
              type="text"
              placeholder="รายละเอียดค่าใช้จ่าย"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border-b-2 border-slate-200 focus:border-orange-500 outline-none py-2.5 mt-1 text-slate-900 bg-transparent"
            />
          </div>

          {/* Note */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              หมายเหตุ (ถ้ามี)
            </label>
            <input
              type="text"
              placeholder="หมายเหตุเพิ่มเติม"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full border-b-2 border-slate-200 focus:border-orange-500 outline-none py-2.5 mt-1 text-slate-900 bg-transparent text-sm"
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="w-full py-4 rounded-xl bg-orange-500 text-white font-bold text-lg active:bg-orange-600 disabled:opacity-60 transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <Plus className="h-5 w-5" />
            {createMutation.isPending ? 'กำลังบันทึก...' : 'บันทึกค่าใช้จ่าย'}
          </button>
        </div>

        {/* Today's list */}
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
          รายการวันนี้ (10 ล่าสุด)
        </p>

        {(todayList?.items ?? []).length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
            <p className="text-slate-400 text-sm">ยังไม่มีรายการค่าใช้จ่ายวันนี้</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(todayList?.items ?? []).map((exp) => (
              <div key={exp.id} className="bg-white rounded-2xl px-4 py-3.5 shadow-sm flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{exp.description}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-xs text-slate-500">{exp.category.name}</span>
                    <span className="text-slate-300">·</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${PAYMENT_COLORS[exp.paymentMethod]}`}>
                      {PAYMENT_LABELS[exp.paymentMethod]}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs text-slate-400">
                      {format(new Date(exp.createdAt), 'HH:mm', { locale: th })}
                    </span>
                  </div>
                  {exp.note && (
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{exp.note}</p>
                  )}
                </div>
                <p className="text-base font-bold text-red-500 shrink-0">
                  {formatThaiMoney(Number(exp.amount))}
                </p>
                <button
                  onClick={() => { setVoidId(exp.id); setVoidReason('') }}
                  className="p-2 rounded-xl bg-slate-100 text-slate-400 active:bg-red-50 active:text-red-500 transition-colors shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Void confirm bottom sheet */}
      {voidId && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setVoidId(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full bg-white rounded-t-3xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-slate-900 text-lg">ยืนยันยกเลิกรายการ</h3>
            <p className="text-sm text-slate-500">ระบุเหตุผลที่ต้องการยกเลิกค่าใช้จ่ายนี้</p>
            <input
              type="text"
              placeholder="เหตุผลที่ยกเลิก (จำเป็น)"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              autoFocus
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3.5 text-slate-900 focus:border-red-400 outline-none text-base"
            />
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setVoidId(null); setVoidReason('') }}
                className="py-4 rounded-xl bg-slate-100 text-slate-700 font-bold text-base active:bg-slate-200"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  if (voidId && voidReason.trim()) {
                    voidMutation.mutate({ id: voidId, reason: voidReason.trim() })
                  }
                }}
                disabled={!voidReason.trim() || voidMutation.isPending}
                className="py-4 rounded-xl bg-red-500 text-white font-bold text-base disabled:opacity-50 active:bg-red-600"
              >
                {voidMutation.isPending ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {printOpts && (
        <PrinterFlowSheet
          receiptHtml={buildExpenseSlipHtml(printOpts)}
          jobName={`ใบค่าใช้จ่าย #${printOpts.slipNumber}`}
          previewData={buildExpenseSlipPreviewData(printOpts)}
          onShare={async () => shareExpenseSlip(printOpts)}
          onClose={() => setPrintOpts(null)}
          successNavItems={[
            { label: 'บันทึกรายการใหม่', href: '/sunmi/expenses' },
            { label: 'กลับหน้าหลัก',    href: '/sunmi' },
          ]}
        />
      )}
    </div>
  )
}

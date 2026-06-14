'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  Plus, ChevronLeft, ChevronRight, X, AlertTriangle,
  Banknote, Smartphone, CreditCard, Receipt, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableBody,
  DataTableRow, DataTableCell, DataTableLoadingRows,
} from '@/components/ui/data-table'
import { formatThaiMoney } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { ModuleGate } from '@/components/auth/module-gate'
import { useBranchContext } from '@/hooks/useBranchContext'
import { BranchContextBar, GlobalModeBanner } from '@/components/layout/branch-context-bar'
import api from '@/lib/api'
import type { Expense, ExpenseCategory } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const PM_LABEL: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอน', CARD: 'บัตร' }
const PM_COLOR: Record<string, string> = {
  CASH:     'bg-emerald-100 text-emerald-700',
  TRANSFER: 'bg-blue-100 text-blue-700',
  CARD:     'bg-purple-100 text-purple-700',
}
const PM_ICON: Record<string, React.ElementType> = {
  CASH: Banknote, TRANSFER: Smartphone, CARD: CreditCard,
}

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

// ── Create Expense Dialog ─────────────────────────────────────────────────────

interface CreateDialogProps {
  categories: ExpenseCategory[]
  onClose: () => void
  onSuccess: () => void
}

function CreateExpenseDialog({ categories, onClose, onSuccess }: CreateDialogProps) {
  const [form, setForm] = useState({
    expenseDate:   todayStr(),
    categoryId:    categories[0]?.id ?? '',
    description:   '',
    amount:        '',
    paymentMethod: 'CASH' as const,
    referenceNo:   '',
    note:          '',
  })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.post('/expenses', { ...data, amount: parseFloat(data.amount) }).then((r) => r.data),
    onSuccess: () => { onSuccess(); onClose() },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  function set(k: keyof typeof form, v: string) {
    setForm((p) => ({ ...p, [k]: v }))
    setError('')
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.categoryId) { setError('กรุณาเลือกหมวดหมู่'); return }
    if (!form.description.trim()) { setError('กรุณากรอกรายการ'); return }
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) { setError('กรุณากรอกจำนวนเงินที่ถูกต้อง'); return }
    mutation.mutate(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">บันทึกค่าใช้จ่าย</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">วันที่</label>
              <input
                type="date"
                value={form.expenseDate}
                max={todayStr()}
                onChange={(e) => set('expenseDate', e.target.value)}
                className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">หมวดหมู่</label>
              <select
                value={form.categoryId}
                onChange={(e) => set('categoryId', e.target.value)}
                className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">-- เลือก --</option>
                {categories.filter((c) => c.isActive).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">รายการ</label>
            <Input
              placeholder="เช่น ค่าเช่าเดือนพฤษภาคม 2568"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              maxLength={255}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">จำนวนเงิน (บาท)</label>
              <Input
                type="number"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                min="0.01"
                step="0.01"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">วิธีชำระ</label>
              <select
                value={form.paymentMethod}
                onChange={(e) => set('paymentMethod', e.target.value as any)}
                className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="CASH">เงินสด</option>
                <option value="TRANSFER">โอนเงิน</option>
                <option value="CARD">บัตร</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">เลขอ้างอิง (ถ้ามี)</label>
              <Input
                placeholder="เลขใบเสร็จ..."
                value={form.referenceNo}
                onChange={(e) => set('referenceNo', e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">หมายเหตุ</label>
              <Input
                placeholder="—"
                value={form.note}
                onChange={(e) => set('note', e.target.value)}
                maxLength={500}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" className="flex-1 gap-1.5" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              บันทึก
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Void Confirm Dialog ───────────────────────────────────────────────────────

interface VoidDialogProps {
  expense: Expense
  onClose: () => void
  onSuccess: () => void
}

function VoidExpenseDialog({ expense, onClose, onSuccess }: VoidDialogProps) {
  const [reason, setReason] = useState('')
  const [error, setError]   = useState('')

  const mutation = useMutation({
    mutationFn: () => api.post(`/expenses/${expense.id}/void`, { voidReason: reason }).then((r) => r.data),
    onSuccess: () => { onSuccess(); onClose() },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-5 py-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">ยกเลิกรายการ</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                {expense.description} · {formatThaiMoney(expense.amount)}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">เหตุผลที่ยกเลิก</label>
            <Input
              placeholder="ระบุเหตุผล..."
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError('') }}
              maxLength={255}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              className="flex-1 gap-1.5"
              disabled={!reason.trim() || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              ยืนยันยกเลิก
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const queryClient = useQueryClient()
  const { user, hasPermission, hasModule } = useAuthStore()
  const canManage = user?.role === 'OWNER' || user?.role === 'MANAGER' || hasPermission('expenses.manage')
  const { branchId, isGlobalMode } = useBranchContext()

  const [viewMonth, setViewMonth]           = useState(() => startOfMonth(new Date()))
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showVoided, setShowVoided]         = useState(false)
  const [createOpen, setCreateOpen]         = useState(false)
  const [voidTarget, setVoidTarget]         = useState<Expense | null>(null)

  const startDate = format(viewMonth, 'yyyy-MM-dd')
  const endDate   = format(endOfMonth(viewMonth), 'yyyy-MM-dd')

  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-categories'],
    queryFn:  () => api.get('/expenses/categories').then((r) => r.data),
  })

  const { data, isLoading } = useQuery<{
    items: Expense[]
    total: number
    page: number
    limit: number
  }>({
    queryKey: ['expenses', startDate, endDate, categoryFilter, showVoided, branchId],
    queryFn: () =>
      api.get('/expenses', {
        params: {
          startDate,
          endDate,
          categoryId: categoryFilter || undefined,
          showVoided: showVoided ? 'true' : undefined,
          limit: '100',
          branchId: branchId || undefined,
        },
      }).then((r) => r.data),
    enabled: canManage,
  })

  const expenses = data?.items ?? []

  const monthlyTotal = useMemo(
    () => expenses.filter((e) => !e.voidedAt).reduce((sum, e) => sum + Number(e.amount), 0),
    [expenses],
  )

  const byCategorySummary = useMemo(() => {
    const map: Record<string, { name: string; total: number; count: number; id: string }> = {}
    for (const e of expenses) {
      if (e.voidedAt) continue
      if (!map[e.categoryId]) map[e.categoryId] = { id: e.categoryId, name: e.category.name, total: 0, count: 0 }
      map[e.categoryId].total += Number(e.amount)
      map[e.categoryId].count++
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [expenses])

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['expenses'] })
  }

  if (!hasModule('finance')) return <ModuleGate module="finance">{null}</ModuleGate>

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-slate-400">
        <AlertTriangle className="h-10 w-10 text-slate-200" />
        <p className="font-medium">ต้องการสิทธิ์เจ้าของร้านหรือผู้จัดการ</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-5">

      <PageHeader
        title="ค่าใช้จ่าย"
        icon={Receipt}
        subtitle={`${format(viewMonth, 'MMMM yyyy', { locale: th })} · รวม ${formatThaiMoney(monthlyTotal)}`}
        secondaryActions={<BranchContextBar className="hidden sm:flex" />}
        primaryAction={
          <Button
            onClick={() => !isGlobalMode && setCreateOpen(true)}
            disabled={isGlobalMode}
            title={isGlobalMode ? 'กรุณาเลือกสาขาก่อนบันทึกค่าใช้จ่าย' : undefined}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">บันทึกค่าใช้จ่าย</span>
            <span className="sm:hidden">เพิ่ม</span>
          </Button>
        }
      />

      {isGlobalMode && <GlobalModeBanner action="ไม่สามารถบันทึกค่าใช้จ่ายในโหมดทุกสาขา" />}

      {/* Month navigation + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-1 py-1">
          <button
            onClick={() => setViewMonth((m) => subMonths(m, 1))}
            className="p-1.5 rounded hover:bg-slate-100 transition-colors"
          >
            <ChevronLeft className="h-4 w-4 text-slate-600" />
          </button>
          <span className="text-sm font-medium px-2 min-w-[120px] text-center text-slate-700">
            {format(viewMonth, 'MMMM yyyy', { locale: th })}
          </span>
          <button
            onClick={() => setViewMonth((m) => addMonths(m, 1))}
            disabled={viewMonth >= startOfMonth(new Date())}
            className="p-1.5 rounded hover:bg-slate-100 transition-colors disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4 text-slate-600" />
          </button>
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-9 px-3 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
        >
          <option value="">ทุกหมวดหมู่</option>
          {categories.filter((c) => c.isActive).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-sm text-slate-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showVoided}
            onChange={(e) => setShowVoided(e.target.checked)}
            className="rounded"
          />
          แสดงรายการยกเลิก
        </label>
      </div>

      {/* Category summary chips */}
      {byCategorySummary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byCategorySummary.map((c) => (
            <button
              key={c.name}
              onClick={() => setCategoryFilter(c.id === categoryFilter ? '' : c.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                c.id === categoryFilter
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              {c.name}
              <span className="ml-1.5 opacity-70 tabular-nums">{formatThaiMoney(c.total)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <SectionCard noPadding>
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>วันที่</DataTableHeadCell>
            <DataTableHeadCell hidden>หมวดหมู่</DataTableHeadCell>
            <DataTableHeadCell>รายการ</DataTableHeadCell>
            <DataTableHeadCell hidden>ช่องทาง</DataTableHeadCell>
            <DataTableHeadCell hidden>อ้างอิง</DataTableHeadCell>
            <DataTableHeadCell right>จำนวน</DataTableHeadCell>
            <DataTableHeadCell hidden>ผู้บันทึก</DataTableHeadCell>
            <DataTableHeadCell className="w-16" />
          </DataTableHead>
          <DataTableBody>
            {isLoading ? (
              <DataTableLoadingRows rows={5} cols={8} />
            ) : expenses.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-0">
                  <EmptyState preset="default" size="md" title="ไม่มีรายการค่าใช้จ่าย" />
                </td>
              </tr>
            ) : (
              expenses.map((expense) => {
                const PMIcon   = PM_ICON[expense.paymentMethod] ?? PM_ICON.CASH
                const isVoided = !!expense.voidedAt
                return (
                  <DataTableRow
                    key={expense.id}
                    className={isVoided ? 'opacity-50' : ''}
                  >
                    <DataTableCell muted>
                      <span className="text-xs whitespace-nowrap">
                        {format(new Date(expense.expenseDate), 'dd MMM yy', { locale: th })}
                      </span>
                    </DataTableCell>
                    <DataTableCell hidden>
                      <span className="text-xs font-medium text-slate-700">
                        {expense.category.name}
                      </span>
                    </DataTableCell>
                    <DataTableCell className="max-w-[200px]">
                      <p className={`text-sm truncate ${isVoided ? 'line-through text-slate-400' : 'text-slate-900 font-medium'}`}>
                        {expense.description}
                      </p>
                      {isVoided && (
                        <p className="text-xs text-red-500 mt-0.5">ยกเลิก: {expense.voidReason}</p>
                      )}
                    </DataTableCell>
                    <DataTableCell hidden>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${PM_COLOR[expense.paymentMethod]}`}>
                        <PMIcon className="h-3 w-3" />
                        {PM_LABEL[expense.paymentMethod]}
                      </span>
                    </DataTableCell>
                    <DataTableCell hidden muted>
                      <span className="text-xs">{expense.referenceNo ?? '—'}</span>
                    </DataTableCell>
                    <DataTableCell right>
                      <span className={`tabular-nums font-bold ${isVoided ? 'text-slate-400' : 'text-slate-900'}`}>
                        {formatThaiMoney(Number(expense.amount))}
                      </span>
                    </DataTableCell>
                    <DataTableCell hidden muted>
                      <span className="text-xs">{expense.createdBy.name}</span>
                    </DataTableCell>
                    <DataTableCell className="text-right">
                      {!isVoided && (
                        <button
                          onClick={() => setVoidTarget(expense)}
                          className="text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50"
                        >
                          ยกเลิก
                        </button>
                      )}
                    </DataTableCell>
                  </DataTableRow>
                )
              })
            )}
          </DataTableBody>
        </DataTable>

        {/* Totals footer */}
        {expenses.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              รวม {expenses.filter((e) => !e.voidedAt).length} รายการ
            </span>
            <span className="font-bold text-slate-900 tabular-nums">
              {formatThaiMoney(monthlyTotal)}
            </span>
          </div>
        )}
      </SectionCard>

      {/* Dialogs */}
      {createOpen && (
        <CreateExpenseDialog
          categories={categories}
          onClose={() => setCreateOpen(false)}
          onSuccess={invalidate}
        />
      )}

      {voidTarget && (
        <VoidExpenseDialog
          expense={voidTarget}
          onClose={() => setVoidTarget(null)}
          onSuccess={invalidate}
        />
      )}
    </div>
  )
}

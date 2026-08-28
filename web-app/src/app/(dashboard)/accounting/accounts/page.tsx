'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Plus, Loader2, AlertTriangle, ScrollText } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableBody,
  DataTableRow, DataTableCell, DataTableLoadingRows,
} from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { ModuleGate } from '@/components/auth/module-gate'
import { apiErrorMessage } from '@/lib/utils'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AccountingAccount {
  id: string
  code: string
  name: string
  nameTh?: string | null
  type: string
  subType?: string | null
  isSystem: boolean
  isActive: boolean
  sortOrder?: number | null
}

// ── Type label ────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  ASSET:     'สินทรัพย์',
  LIABILITY: 'หนี้สิน',
  EQUITY:    'ทุน',
  REVENUE:   'รายได้',
  EXPENSE:   'ค่าใช้จ่าย',
}

const TYPE_COLOR: Record<string, string> = {
  ASSET:     'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  LIABILITY: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  EQUITY:    'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  REVENUE:   'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  EXPENSE:   'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
}

// ── Initialize CTA ────────────────────────────────────────────────────────────

function InitializeCTA({ onSuccess }: { onSuccess: () => void }) {
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => api.post('/accounting/accounts/initialize', {}).then((r) => r.data),
    onSuccess,
    onError: (e: any) => setError(apiErrorMessage(e)),
  })

  return (
    <div className="flex flex-col items-center gap-5 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-900/30">
        <BookOpen className="h-7 w-7 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-slate-900 dark:text-slate-50">ยังไม่มีผังบัญชี</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          กด "สร้างผังบัญชีมาตรฐาน" เพื่อสร้างบัญชีทั้งหมดโดยอัตโนมัติ
        </p>
      </div>
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      <Button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="gap-2"
      >
        {mutation.isPending
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Plus className="h-4 w-4" />}
        สร้างผังบัญชีมาตรฐาน
      </Button>
    </div>
  )
}

// ── Main content ──────────────────────────────────────────────────────────────

function AccountsContent() {
  const queryClient = useQueryClient()
  const [typeFilter, setTypeFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const { data: accounts = [], isLoading } = useQuery<AccountingAccount[]>({
    queryKey: ['accounting-accounts'],
    queryFn: () => api.get('/accounting/accounts').then((r) => r.data),
  })

  const filtered = accounts.filter((a) => {
    if (!showInactive && !a.isActive) return false
    if (typeFilter && a.type !== typeFilter) return false
    return true
  })

  const typeSet: Record<string, true> = {}
  accounts.forEach((a) => { typeSet[a.type] = true })
  const types = Object.keys(typeSet).sort()

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['accounting-accounts'] })
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="ผังบัญชี"
        icon={BookOpen}
        subtitle={`${accounts.length} บัญชี`}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 px-3 border border-slate-200 dark:border-slate-700/60 rounded-lg text-sm bg-white dark:bg-[#1E293B] dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">ทุกประเภท</option>
          {types.map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded"
          />
          แสดงบัญชีที่ปิด
        </label>
      </div>

      <SectionCard noPadding>
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>รหัส</DataTableHeadCell>
            <DataTableHeadCell>ชื่อบัญชี</DataTableHeadCell>
            <DataTableHeadCell hidden>ประเภท</DataTableHeadCell>
            <DataTableHeadCell hidden>ประเภทย่อย</DataTableHeadCell>
            <DataTableHeadCell hidden>ระบบ</DataTableHeadCell>
            <DataTableHeadCell>สถานะ</DataTableHeadCell>
            <DataTableHeadCell></DataTableHeadCell>
          </DataTableHead>
          <DataTableBody>
            {isLoading ? (
              <DataTableLoadingRows rows={10} cols={6} />
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-0">
                  <InitializeCTA onSuccess={invalidate} />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-0">
                  <EmptyState preset="default" size="md" title="ไม่มีบัญชีที่ตรงกับตัวกรอง" />
                </td>
              </tr>
            ) : (
              filtered.map((acct) => (
                <DataTableRow key={acct.id} className={!acct.isActive ? 'opacity-50' : ''}>
                  <DataTableCell>
                    <span className="font-mono text-sm text-slate-700 dark:text-slate-300">
                      {acct.code}
                    </span>
                  </DataTableCell>
                  <DataTableCell>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-50">{acct.nameTh ?? acct.name}</p>
                    {acct.nameTh && <p className="text-xs text-slate-400 dark:text-slate-500">{acct.name}</p>}
                  </DataTableCell>
                  <DataTableCell hidden>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLOR[acct.type] ?? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                      {TYPE_LABEL[acct.type] ?? acct.type}
                    </span>
                  </DataTableCell>
                  <DataTableCell hidden muted>
                    <span className="text-xs">{acct.subType ?? '—'}</span>
                  </DataTableCell>
                  <DataTableCell hidden muted>
                    <span className="text-xs">{acct.isSystem ? 'ระบบ' : 'กำหนดเอง'}</span>
                  </DataTableCell>
                  <DataTableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      acct.isActive
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}>
                      {acct.isActive ? 'ใช้งาน' : 'ปิด'}
                    </span>
                  </DataTableCell>
                  <DataTableCell>
                    <Link
                      href={`/accounting/accounts/${acct.id}`}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                    >
                      <ScrollText className="h-3.5 w-3.5" />
                      Ledger
                    </Link>
                  </DataTableCell>
                </DataTableRow>
              ))
            )}
          </DataTableBody>
        </DataTable>
      </SectionCard>
    </div>
  )
}

export default function AccountingAccountsPage() {
  return (
    <ModuleGate module="accounting">
      <AccountsContent />
    </ModuleGate>
  )
}

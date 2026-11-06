'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Search, User, X } from 'lucide-react'
import api from '@/lib/api'

export interface PickedCustomer { id: string; name: string; phone?: string | null }

/** Search the shop's customers by name or phone and pick one */
export function CustomerPickSheet({ title, hint, excludeId, onPick, onClose }: {
  title: string
  hint?: string
  excludeId?: string | null
  onPick: (c: PickedCustomer) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const term = q.trim()
  const { data = [], isFetching } = useQuery<PickedCustomer[]>({
    queryKey: ['customers', 'pick', term],
    queryFn: async () => {
      const res = await api.get('/customers', { params: { search: term } })
      const list = Array.isArray(res.data) ? res.data : res.data?.items ?? res.data?.data ?? []
      return list.slice(0, 20)
    },
    enabled: term.length >= 2,
    staleTime: 10_000,
  })
  const rows = data.filter((c) => c.id !== excludeId)
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-t-3xl bg-white sm:rounded-3xl dark:bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <User className="h-5 w-5 text-blue-600" />
          <p className="flex-1 font-bold">{title}</p>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-4 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อ หรือเบอร์โทรลูกค้า"
              className="h-11 w-full rounded-xl border border-slate-200 pl-9 pr-9 text-sm outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800" />
            {isFetching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
          </div>
          {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4 pt-2">
          {term.length < 2 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">พิมพ์อย่างน้อย 2 ตัวอักษร</p>}
          {term.length >= 2 && !isFetching && rows.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">ไม่พบลูกค้า</p>}
          {rows.map((c) => (
            <button key={c.id} type="button" onClick={() => onPick(c)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600 dark:bg-slate-800">{c.name.slice(0, 1)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{c.name}</span>
                <span className="block text-xs text-muted-foreground">{c.phone || 'ไม่มีเบอร์'}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

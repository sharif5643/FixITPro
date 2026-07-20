'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, User, Phone, X, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

interface Customer {
  id: string
  name: string
  phone?: string | null
}

interface CustomerSearchDialogProps {
  open: boolean
  onSelect: (customer: { name: string; phone?: string }) => void
  onClose: () => void
}

export function CustomerSearchDialog({ open, onSelect, onClose }: CustomerSearchDialogProps) {
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setSearch('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const { data, isLoading } = useQuery<{ items: Customer[] }>({
    queryKey: ['customers', 'search', search],
    queryFn: async () =>
      (await api.get('/customers', { params: { search: search || undefined, limit: 20 } })).data,
    enabled: open,
    staleTime: 10_000,
  })

  const customers = data?.items ?? []

  function handleSelect(c: Customer) {
    onSelect({ name: c.name, phone: c.phone ?? undefined })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-blue-500" />
            ค้นหาลูกค้า (F3)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              ref={inputRef}
              placeholder="ชื่อหรือเบอร์โทร..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); inputRef.current?.focus() }}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="min-h-[160px] max-h-72 overflow-y-auto space-y-1">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : customers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                <User className="h-8 w-8 text-slate-200 dark:text-slate-700" />
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  {search ? `ไม่พบลูกค้า "${search}"` : 'ยังไม่มีลูกค้าในระบบ'}
                </p>
              </div>
            ) : (
              customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all',
                    'border-transparent hover:border-blue-200 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20',
                  )}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700/60 shrink-0">
                    <User className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{c.name}</p>
                    {c.phone && (
                      <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <Phone className="h-3 w-3" />
                        {c.phone}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Skip option */}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            ข้ามการระบุลูกค้า
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

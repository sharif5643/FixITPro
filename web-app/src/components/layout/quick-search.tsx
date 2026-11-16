'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ArrowRight, Command, User, Wrench, Receipt, Loader2 } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

// ── Nav catalogue (mirrors sidebar structure, labels only) ────────────────────

const NAV_ITEMS = [
  { href: '/',                       label: 'แดชบอร์ด',             section: '' },
  { href: '/sales',                  label: 'ขายสินค้า (POS)',       section: 'การขาย' },
  { href: '/repairs',                label: 'งานซ่อม',               section: 'การขาย' },
  { href: '/shifts',                 label: 'เปิด/ปิดกะ',            section: 'การขาย' },
  { href: '/expenses',               label: 'ค่าใช้จ่าย',             section: 'การขาย' },
  { href: '/products',               label: 'สินค้า',                section: 'สินค้า' },
  { href: '/categories',             label: 'หมวดหมู่สินค้า',         section: 'สินค้า' },
  { href: '/barcode-print',          label: 'พิมพ์ Barcode',          section: 'สินค้า' },
  { href: '/transfers',              label: 'โอนสต็อก',              section: 'สินค้า' },
  { href: '/customers',              label: 'ลูกค้า',                section: 'ลูกค้า' },
  { href: '/debt',                   label: 'หนี้ค้างชำระ',           section: 'ลูกค้า' },
  { href: '/reports/daily-closing',  label: 'รายงานปิดวัน',          section: 'รายงาน' },
  { href: '/reports/profit',         label: 'รายงานกำไร',            section: 'รายงาน' },
  { href: '/analytics',              label: 'วิเคราะห์เชิงลึก',       section: 'รายงาน' },
  { href: '/suppliers',              label: 'ซัพพลายเออร์',           section: 'การจัดซื้อ' },
  { href: '/purchase-orders',        label: 'ใบสั่งซื้อ (PO)',         section: 'การจัดซื้อ' },
  { href: '/reports/payables',       label: 'รายงานเจ้าหนี้',         section: 'การจัดซื้อ' },
  { href: '/serials',                label: 'Serial / IMEI',          section: 'จัดการ' },
  { href: '/claims',                 label: 'จัดการเคลม',             section: 'จัดการ' },
  { href: '/warranties',             label: 'การรับประกัน',           section: 'จัดการ' },
  { href: '/technicians',            label: 'ประสิทธิภาพช่าง',        section: 'จัดการ' },
  { href: '/employees',              label: 'พนักงาน',               section: 'จัดการ' },
  { href: '/roles',                  label: 'สิทธิ์การใช้งาน',        section: 'จัดการ' },
  { href: '/branches',               label: 'สาขา',                  section: 'จัดการ' },
  { href: '/data-tools',             label: 'เครื่องมือข้อมูล',        section: 'จัดการ' },
  { href: '/notifications',          label: 'การแจ้งเตือน',           section: 'จัดการ' },
  { href: '/backup',                 label: 'Backup ข้อมูล',          section: 'จัดการ' },
  { href: '/audit-logs',             label: 'ประวัติกิจกรรม',         section: 'จัดการ' },
  { href: '/settings',               label: 'ตั้งค่า',               section: 'จัดการ' },
  { href: '/subscription',           label: 'แพ็กเกจ / ต่ออายุ',      section: 'จัดการ' },
]

// ── Records search ───────────────────────────────────────────────────────────

type Hit = { key: string; kind: 'customer' | 'repair' | 'sale' | 'page'; href: string; title: string; sub?: string }

const KIND_LABEL: Record<Hit['kind'], string> = { customer: 'ลูกค้า', repair: 'งานซ่อม', sale: 'บิลขาย', page: 'หน้า' }
const KIND_ICON: Record<Hit['kind'], React.ElementType | null> = { customer: User, repair: Wrench, sale: Receipt, page: null }

const money = (n: unknown) => `฿${Number(n ?? 0).toLocaleString('th-TH')}`
const listOf = (d: any): any[] => (Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [])
const bkkDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

export async function searchRecords(q: string): Promise<Hit[]> {
  const get = (url: string, params: Record<string, string>) =>
    api.get(url, { params }).then((r) => listOf(r.data)).catch(() => [] as any[])
  const [customers, repairs, sales] = await Promise.all([
    get('/customers', { search: q }),
    get('/repairs', { search: q, limit: '5' }),
    get('/sales', { search: q, limit: '5' }),
  ])
  return [
    ...repairs.slice(0, 5).map((r): Hit => ({
      key: `repair:${r.id}`, kind: 'repair', href: `/repairs/${r.id}`,
      title: `${r.ticketNumber} · ${[r.deviceBrand, r.deviceModel].filter(Boolean).join(' ')}`,
      sub: [r.customer?.name, r.customer?.phone, r.deviceImei].filter(Boolean).join(' · '),
    })),
    ...customers.slice(0, 5).map((c): Hit => ({
      key: `customer:${c.id}`, kind: 'customer', href: `/customers/${c.id}`,
      title: c.name, sub: c.phone ?? undefined,
    })),
    ...sales.slice(0, 5).map((s): Hit => ({
      key: `sale:${s.id}`, kind: 'sale',
      href: `/sales/history?date=${bkkDate(s.createdAt)}&q=${encodeURIComponent(s.receiptNumber)}`,
      title: `${s.receiptNumber} · ${money(s.total)}`,
      sub: [new Date(s.createdAt).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }), s.customer?.name].filter(Boolean).join(' · '),
    })),
  ]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function QuickSearch() {
  const router = useRouter()
  const [open, setOpen]           = useState(false)
  const [query, setQuery]         = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef  = useRef<HTMLInputElement>(null)

  const pages = query.trim()
    ? NAV_ITEMS.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.section.toLowerCase().includes(query.toLowerCase())
      )
    : NAV_ITEMS.slice(0, 9)

  // Records: customers, repair jobs (number, IMEI, model, phone) and bills, searched as you type.
  // Each kind the user may not see (no permission) just comes back empty.
  const [records, setRecords] = useState<Hit[]>([])
  const [searching, setSearching] = useState(false)
  useEffect(() => {
    const q = query.trim()
    if (!open || q.length < 2) { setRecords([]); setSearching(false); return }
    let stale = false
    setSearching(true)
    const t = setTimeout(async () => {
      const hits = await searchRecords(q)
      if (!stale) { setRecords(hits); setSearching(false) }
    }, 300)
    return () => { stale = true; clearTimeout(t) }
  }, [query, open])

  const filtered: Hit[] = [
    ...records,
    ...pages.map((p) => ({ key: `page:${p.href}`, kind: 'page' as const, href: p.href, title: p.label, sub: p.section })),
  ]

  const navigate = useCallback((href: string) => {
    setOpen(false)
    setQuery('')
    router.push(href)
  }, [router])

  // Global Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Reset active index whenever results change
  useEffect(() => { setActiveIndex(0) }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[activeIndex]) {
      navigate(filtered[activeIndex].href)
    }
  }

  const handleClose = (o: boolean) => {
    setOpen(o)
    if (!o) setQuery('')
  }

  return (
    <>
      {/* Trigger button (shown in header) */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center sm:justify-start gap-2 h-9 w-9 sm:h-8 sm:w-auto rounded-lg border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60 sm:px-3 text-xs text-slate-500 dark:text-slate-400 hover:border-blue-300 hover:bg-white dark:hover:bg-slate-700/40 hover:text-slate-700 dark:hover:text-slate-300 transition-colors sm:min-w-[220px]"
        aria-label="ค้นหาลูกค้า งานซ่อม บิล (Ctrl+K)"
      >
        <Search className="h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0" />
        <span className="hidden sm:inline flex-1 text-left truncate">ค้นหาลูกค้า งานซ่อม บิล...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-1.5 py-0.5 text-[10px] font-mono leading-none">
          <Command className="h-2.5 w-2.5" />K
        </kbd>
      </button>

      {/* Search dialog */}
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent
          className="p-0 gap-0 max-w-lg overflow-hidden"
          onKeyDown={handleKeyDown}
        >
          {/* Input row */}
          <div className="flex items-center border-b px-4 py-3 gap-3">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="ชื่อลูกค้า เบอร์โทร IMEI เลขงาน เลขบิล หรือชื่อหน้า"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 px-1"
              >
                ล้าง
              </button>
            )}
            <kbd className="text-[10px] text-slate-400 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5 font-mono">
              Esc
            </kbd>
          </div>

          {/* Results list */}
          <div className="max-h-80 overflow-y-auto py-2">
            {searching && (
              <p className="flex items-center gap-2 px-4 pb-1.5 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังค้นหา...
              </p>
            )}
            {filtered.length === 0 && !searching ? (
              <div className="flex flex-col items-center py-10 text-center gap-2">
                <Search className="h-8 w-8 text-slate-200 dark:text-slate-600" />
                <p className="text-sm text-slate-500">ไม่พบ &ldquo;{query}&rdquo;</p>
              </div>
            ) : (
              <>
                {!query && (
                  <p className="px-4 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    เมนูหลัก
                  </p>
                )}
                {filtered.map((item, i) => {
                  const Icon = KIND_ICON[item.kind]
                  const heading = i === 0 || filtered[i - 1].kind !== item.kind ? KIND_LABEL[item.kind] : null
                  return (
                  <div key={item.key}>
                  {query.trim() && heading && (
                    <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{heading}</p>
                  )}
                  <button
                    onClick={() => navigate(item.href)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      i === activeIndex
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/40',
                    )}
                  >
                    {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium">{item.title}</span>
                      {item.sub && (
                        <span className={cn('text-[11px] text-slate-500', item.kind === 'page' ? 'ml-2' : 'block truncate')}>{item.sub}</span>
                      )}
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" />
                  </button>
                  </div>
                  )
                })}
              </>
            )}
          </div>

          {/* Footer hints */}
          <div className="border-t px-4 py-2 flex items-center gap-4 text-[11px] text-slate-400">
            <span><kbd className="font-mono border border-slate-200 dark:border-slate-600 rounded px-1">↑↓</kbd> เลื่อน</span>
            <span><kbd className="font-mono border border-slate-200 dark:border-slate-600 rounded px-1">↵</kbd> เปิด</span>
            <span><kbd className="font-mono border border-slate-200 dark:border-slate-600 rounded px-1">Esc</kbd> ปิด</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

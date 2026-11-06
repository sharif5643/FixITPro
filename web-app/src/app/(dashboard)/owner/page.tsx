'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowDownRight, ArrowUpRight, Banknote, CheckCircle2, ChevronDown, ChevronRight, Clock, CreditCard,
  Crown, Loader2, Lock, MessageCircle, Package, QrCode, Receipt, RefreshCw, Send, Smartphone, Store,
  Truck, Wallet, Wrench,
} from 'lucide-react'
import api from '@/lib/api'
import { apiErrorMessage, cn, formatThaiMoney } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useBranchContext } from '@/hooks/useBranchContext'
import { actionsOf, thaiDayLabel, type Action, type BranchMoney, type OwnerToday } from '@/lib/owner-hub'

/**
 * ห้องเจ้าของร้าน — today's money for every branch on one page, what is waiting for the owner, and
 * the evening LINE summary. Only for the owner of a shop the super admin switched it on for.
 */
export default function OwnerHubPage() {
  const user = useAuthStore((s) => s.user)
  const hasModule = useAuthStore((s) => s.hasModule)
  if (user?.role !== 'OWNER') return <Locked title="สำหรับเจ้าของร้านเท่านั้น" text="หน้านี้แสดงเงินและเรื่องที่ต้องจัดการของทั้งร้าน จึงเปิดได้เฉพาะบัญชีเจ้าของร้าน" />
  if (!hasModule('owner_hub')) return <Locked title="ห้องเจ้าของร้านยังไม่ได้เปิดใช้งาน" text="ติดต่อผู้ดูแลระบบ FixITPro เพื่อขอเปิดโมดูลนี้ให้ร้านของคุณ" />
  return <OwnerHub name={user?.name ?? ''} />
}

function Locked({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
          <Lock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{text}</p>
        <Link href="/dashboard" className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">กลับหน้าแรก</Link>
      </div>
    </div>
  )
}

// ── Shared bits ──────────────────────────────────────────────────────────────

const card = 'rounded-3xl border border-slate-100 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.05)] dark:border-slate-700/60 dark:bg-[#1E293B]'
const money = (n: number) => formatThaiMoney(Math.round(n))

function greeting() {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok', hour: 'numeric', hour12: false }))
  return h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น'
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 px-1">
      <h2 className="text-[15px] font-bold text-slate-800 dark:text-slate-100">{children}</h2>
      {right}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

function OwnerHub({ name }: { name: string }) {
  const { branchId: globalBranch } = useBranchContext()
  const [picked, setPicked] = useState<string | undefined>(undefined)
  const branchId = picked ?? globalBranch
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery<OwnerToday>({
    queryKey: ['owner-hub', branchId ?? 'all'],
    queryFn: async () => (await api.get('/owner-hub/today', { params: branchId ? { branchId } : {} })).data,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12">
      {/* Greeting */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-orange-500/20">
          <Crown className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{greeting()}{name ? ` คุณ${name}` : ''}</p>
          <h1 className="truncate text-xl font-black tracking-tight">ห้องเจ้าของร้าน</h1>
        </div>
        <button type="button" onClick={() => refetch()} disabled={isFetching} aria-label="รีเฟรช"
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-300">
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
        </button>
      </div>

      {isLoading && <div className={cn(card, 'flex h-48 items-center justify-center text-sm text-muted-foreground')}><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังโหลด…</div>}
      {isError && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{apiErrorMessage(error)}</p>}

      {data && (
        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <div className="space-y-5">
            <Hero data={data} picked={!!picked} onAll={() => setPicked(undefined)} />
            <Tiles m={data.total} />
            <div className="lg:hidden"><ToDo data={data} /></div>
            {data.branches.length > 1 && <Branches rows={data.branches} total={data.total.revenue} onPick={setPicked} />}
          </div>
          <div className="space-y-5">
            <div className="hidden lg:block"><ToDo data={data} /></div>
            <LineCard />
            <p className="px-1 text-center text-[11px] text-muted-foreground">
              อัปเดตเองทุก 1 นาที · ล่าสุด {new Date(dataUpdatedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Hero: today's money ──────────────────────────────────────────────────────

function Hero({ data, picked, onAll }: { data: OwnerToday; picked: boolean; onAll: () => void }) {
  const m = data.total
  const parts = [
    { key: 'cash', label: 'เงินสด', v: m.cash, icon: Banknote, bar: 'bg-emerald-300' },
    { key: 'transfer', label: 'โอน / QR', v: m.transfer, icon: QrCode, bar: 'bg-sky-300' },
    { key: 'card', label: 'บัตร', v: m.card, icon: CreditCard, bar: 'bg-violet-300' },
  ]
  const sum = parts.reduce((t, p) => t + p.v, 0)
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-5 text-white shadow-xl shadow-blue-900/20 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-indigo-400/20 blur-2xl" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2 text-xs text-blue-100">
          <span className="rounded-full bg-white/15 px-2.5 py-1 font-semibold">วันนี้ {thaiDayLabel(data.date)}</span>
          <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 font-semibold"><Store className="h-3 w-3" />{m.name}</span>
          {picked && <button type="button" onClick={onAll} className="rounded-full bg-white px-2.5 py-1 font-semibold text-blue-700">ดูทุกสาขา</button>}
        </div>
        <p className="mt-4 text-sm text-blue-100">รายรับวันนี้</p>
        <p className="text-[40px] font-black leading-tight tabular-nums sm:text-5xl">{money(m.revenue)}</p>

        <div className="mt-4 flex h-2.5 gap-1 overflow-hidden rounded-full bg-white/15">
          {sum > 0 && parts.filter((p) => p.v > 0).map((p) => <div key={p.key} className={p.bar} style={{ flex: p.v }} />)}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {parts.map((p) => (
            <div key={p.key} className="rounded-2xl bg-white/10 px-3 py-2.5 backdrop-blur">
              <p className="flex items-center gap-1.5 text-[11px] text-blue-100"><span className={cn('h-2 w-2 rounded-full', p.bar)} />{p.label}</p>
              <p className="mt-0.5 text-[15px] font-bold tabular-nums sm:text-base">{money(p.v)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Three tiles under the hero ───────────────────────────────────────────────

function Tile({ icon: Icon, tone, label, value, sub, href }: {
  icon: React.ElementType; tone: 'green' | 'red' | 'slate'; label: string; value: string; sub: string; href: string
}) {
  const t = {
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    red: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300',
  }[tone]
  return (
    <Link href={href} className={cn(card, 'group block p-4 transition hover:-translate-y-0.5 hover:shadow-lg')}>
      <div className="flex items-center justify-between">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', t)}><Icon className="h-[18px] w-[18px]" /></span>
        <ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500" />
      </div>
      <p className="mt-3 text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn('text-xl font-black tabular-nums', tone === 'green' && 'text-emerald-600 dark:text-emerald-400', tone === 'red' && 'text-rose-600 dark:text-rose-400')}>{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>
    </Link>
  )
}

function Tiles({ m }: { m: BranchMoney }) {
  const loss = m.netProfit < 0
  const margin = m.revenue > 0 ? Math.round((m.netProfit / m.revenue) * 100) : 0
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1">
      <Tile icon={loss ? ArrowDownRight : ArrowUpRight} tone={loss ? 'red' : 'green'} label="กำไรสุทธิ"
        value={`${loss ? '−' : ''}${money(Math.abs(m.netProfit))}`} sub={m.revenue > 0 ? `${margin}% ของรายรับ · หักทุนและค่าใช้จ่ายแล้ว` : 'หักทุนและค่าใช้จ่ายแล้ว'} href="/reports/profit" />
      <Tile icon={Wallet} tone="red" label="เงินออกจากลิ้นชัก" value={money(m.drawerOut)}
        sub={`ค่าใช้จ่ายทั้งวัน ${money(m.expenses)}`} href="/reports/daily-closing" />
      <Tile icon={Receipt} tone="slate" label="รายการวันนี้" value={`${m.bills + m.repairPayments} รายการ`}
        sub={`บิลขาย ${m.bills} · งานซ่อม ${m.repairPayments}`} href="/reports/daily-closing" />
    </div>
  )
}

// ── Branches ─────────────────────────────────────────────────────────────────

function Branches({ rows, total, onPick }: { rows: BranchMoney[]; total: number; onPick: (id: string) => void }) {
  return (
    <section>
      <SectionTitle right={<span className="text-[11px] text-muted-foreground">แตะเพื่อดูเฉพาะสาขา</span>}>แยกตามสาขา</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((b) => {
          const share = total > 0 ? Math.round((b.revenue / total) * 100) : 0
          return (
            <button key={b.branchId ?? b.name} type="button" onClick={() => b.branchId && onPick(b.branchId)}
              className={cn(card, 'group p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg')}>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"><Store className="h-4 w-4" /></span>
                <p className="min-w-0 flex-1 truncate text-sm font-bold">{b.name}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{share}%</span>
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] text-muted-foreground">รายรับ</p>
                  <p className="text-lg font-black tabular-nums">{money(b.revenue)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">กำไร</p>
                  <p className={cn('text-sm font-bold tabular-nums', b.netProfit < 0 ? 'text-rose-600' : 'text-emerald-600')}>{b.netProfit < 0 ? '−' : ''}{money(Math.abs(b.netProfit))}</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" style={{ width: `${share}%` }} />
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ── What needs the owner ─────────────────────────────────────────────────────

const ACTION_ICON: Record<string, React.ElementType> = {
  shifts: Clock, po: Truck, overdue: Wrench, pickup: Smartphone, debt: Wallet, stock: Package,
}

function ActionRow({ a }: { a: Action }) {
  const [open, setOpen] = useState(false)
  const Icon = ACTION_ICON[a.key] ?? Receipt
  const hasRows = !!a.rows?.length
  return (
    <li className="py-1">
      <div className="flex items-start gap-3 rounded-2xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <span className={cn('relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          a.urgent ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400')}>
          <Icon className="h-[18px] w-[18px]" />
          {a.urgent && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-[#1E293B]" />}
        </span>
        <Link href={a.href} className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{a.title}</p>
          {a.hint && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{a.hint}</p>}
        </Link>
        {hasRows ? (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-label={open ? 'ซ่อนรายการ' : 'ดูรายการ'}
            className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
            <ChevronDown className={cn('h-4 w-4 transition', open && 'rotate-180')} />
          </button>
        ) : (
          <Link href={a.href} aria-label="ไปจัดการ" className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center text-slate-300"><ChevronRight className="h-4 w-4" /></Link>
        )}
      </div>
      {open && hasRows && (
        <ul className="mb-1 ml-14 mr-2 space-y-0.5 rounded-xl bg-slate-50 p-1.5 dark:bg-slate-800/60">
          {a.rows!.map((r) => (
            <li key={r.href + r.label}>
              <Link href={r.href} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white dark:hover:bg-slate-700">
                <span className="min-w-0 flex-1 truncate">
                  <span className={cn('font-semibold', r.code && 'font-mono text-[11px]')}>{r.label}</span>
                  {r.sub && <span className="text-muted-foreground"> · {r.sub}</span>}
                </span>
                <span className="shrink-0 font-medium text-slate-500">{r.right}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function ToDo({ data }: { data: OwnerToday }) {
  const items = actionsOf(data.actions)
  const urgent = items.filter((a) => a.urgent).length
  return (
    <section className={cn(card, 'p-4')}>
      <div className="mb-1 flex items-center gap-2 px-2">
        <h2 className="flex-1 text-[15px] font-bold">ต้องจัดการ</h2>
        {items.length > 0 && (
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', urgent ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300')}>
            {items.length} เรื่อง{urgent ? ` · ด่วน ${urgent}` : ''}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30"><CheckCircle2 className="h-6 w-6" /></span>
          <p className="text-sm font-semibold">ไม่มีเรื่องค้าง</p>
          <p className="text-xs text-muted-foreground">วันนี้ร้านเรียบร้อยดี</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
          {items.map((a) => <ActionRow key={a.key} a={a} />)}
        </ul>
      )}
    </section>
  )
}

// ── LINE ──────────────────────────────────────────────────────────────────────

interface LineState { linked: boolean; dailySummary: boolean; preview: string }
interface LinkInfo { ready: boolean; linked: boolean; url: string | null; oaId: string | null }

function Switch({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      className={cn('relative h-7 w-12 shrink-0 rounded-full ring-1 ring-white/40 transition disabled:opacity-60', on ? 'bg-white/35' : 'bg-black/25')}>
      <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  )
}

function LineCard() {
  const qc = useQueryClient()
  const [showPreview, setShowPreview] = useState(false)
  const { data: link } = useQuery<LinkInfo>({
    queryKey: ['line-staff-link'],
    queryFn: () => api.get('/line/staff/link').then((r) => r.data),
    staleTime: 60_000,
  })
  const { data } = useQuery<LineState>({
    queryKey: ['owner-hub-line'],
    queryFn: () => api.get('/owner-hub/line').then((r) => r.data),
    staleTime: 60_000,
  })
  const toggle = useMutation({
    mutationFn: (on: boolean) => api.put('/owner-hub/line/daily', { on }),
    onSuccess: (_r, on) => { toast.success(on ? 'เปิดสรุปยอดทุก 3 ทุ่มแล้ว' : 'ปิดสรุปยอดทุก 3 ทุ่มแล้ว'); qc.invalidateQueries({ queryKey: ['owner-hub-line'] }) },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })
  const test = useMutation({
    mutationFn: () => api.post('/owner-hub/line/test', {}),
    onSuccess: () => toast.success('ส่งสรุปยอดเข้า LINE แล้ว ดูในแชตได้เลย'),
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const linked = !!(data?.linked || link?.linked)
  const on = data?.dailySummary ?? true
  return (
    <section className={cn(card, 'overflow-hidden')}>
      <div className="flex items-center gap-3 bg-[#06C755] px-4 py-3 text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20"><MessageCircle className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">สรุปยอดเข้า LINE</p>
          <p className="text-[11px] text-green-50">ทุกวัน 21:00 น. · เฉพาะเจ้าของร้าน</p>
        </div>
        {linked && <Switch on={on} disabled={toggle.isPending} onChange={(v) => toggle.mutate(v)} />}
      </div>

      <div className="space-y-3 p-4">
        {link && !link.ready ? (
          <p className="text-sm text-muted-foreground">ระบบ LINE ของ FixITPro ยังไม่พร้อมใช้งาน</p>
        ) : !linked ? (
          <>
            <p className="text-sm text-muted-foreground">เชื่อม LINE ของคุณครั้งเดียว แล้วทุก 3 ทุ่มจะได้ยอดเงิน กำไร และเรื่องที่ต้องจัดการในแชต</p>
            {link?.url && (
              <a href={link.url} target="_blank" rel="noopener noreferrer"
                onClick={() => setTimeout(() => { qc.invalidateQueries({ queryKey: ['line-staff-link'] }); qc.invalidateQueries({ queryKey: ['owner-hub-line'] }) }, 15_000)}
                className="flex items-center justify-center gap-2 rounded-2xl bg-[#06C755] py-2.5 text-sm font-bold text-white hover:brightness-95">
                <MessageCircle className="h-4 w-4" />เชื่อม LINE ของฉัน
              </a>
            )}
          </>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#06C755]" />เชื่อมแล้ว{link?.oaId ? ` กับแชต ${link.oaId}` : ''}{on ? '' : ' · ปิดการส่งอยู่'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => test.mutate()} disabled={test.isPending}
                className="flex items-center justify-center gap-1.5 rounded-2xl bg-[#06C755] py-2.5 text-sm font-bold text-white hover:brightness-95 disabled:opacity-60">
                {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}ส่งให้ดูตอนนี้
              </button>
              <button type="button" onClick={() => setShowPreview((v) => !v)}
                className="rounded-2xl border border-slate-200 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                {showPreview ? 'ซ่อนตัวอย่าง' : 'ดูตัวอย่าง'}
              </button>
            </div>
          </>
        )}

        {(showPreview || !linked) && data?.preview && (
          <div className="rounded-2xl bg-[#8CABD9]/25 p-3 dark:bg-slate-900/60">
            <div className="flex items-start gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-black text-white">FIX</span>
              <div className="min-w-0">
                <p className="mb-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">FixITPro</p>
                <div className="whitespace-pre-wrap rounded-2xl rounded-tl-md bg-white px-3 py-2.5 text-[12px] leading-relaxed text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-100">
                  {data.preview}
                </div>
                <p className="mt-1 text-[10px] text-slate-500">21:00</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

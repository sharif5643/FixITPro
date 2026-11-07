'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle, CheckCircle2, ChevronRight, Crown, Loader2, Lock, MessageCircle, RefreshCw, Send,
} from 'lucide-react'
import api from '@/lib/api'
import { apiErrorMessage, cn, formatThaiMoney } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useBranchContext } from '@/hooks/useBranchContext'
import { PageHeader } from '@/components/ui/page-header'
import { MoneyLine } from '@/components/reports/money-parts'
import {
  actionsOf, thaiDayLabel, type BranchMoney, type OwnerToday,
} from '@/lib/owner-hub'

/**
 * ห้องเจ้าของร้าน — today's money for every branch on one page, what is waiting for the owner, and
 * the evening LINE summary. Only for the owner of a shop the super admin switched it on for.
 */
export default function OwnerHubPage() {
  const user = useAuthStore((s) => s.user)
  const hasModule = useAuthStore((s) => s.hasModule)
  if (user?.role !== 'OWNER') return <Locked title="สำหรับเจ้าของร้านเท่านั้น" text="หน้านี้แสดงเงินและเรื่องที่ต้องจัดการของทั้งร้าน จึงเปิดได้เฉพาะบัญชีเจ้าของร้าน" />
  if (!hasModule('owner_hub')) return <Locked title="ห้องเจ้าของร้านยังไม่ได้เปิดใช้งาน" text="ติดต่อผู้ดูแลระบบ FixITPro เพื่อขอเปิดโมดูลนี้ให้ร้านของคุณ" />
  return <OwnerHub />
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
        <Link href="/dashboard" className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">กลับหน้าแรก</Link>
      </div>
    </div>
  )
}

function OwnerHub() {
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
    <div className="mx-auto max-w-5xl space-y-5 pb-10">
      <PageHeader
        title="ห้องเจ้าของร้าน"
        icon={Crown}
        subtitle={data ? `วันนี้ ${thaiDayLabel(data.date)} · ${data.total.name}` : 'เงินวันนี้และเรื่องที่ต้องจัดการ'}
        primaryAction={
          <button type="button" onClick={() => refetch()} disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800">
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />รีเฟรช
          </button>
        }
      />

      {picked && (
        <button type="button" onClick={() => setPicked(undefined)} className="text-sm font-semibold text-blue-600 hover:underline">
          ← กลับไปดูทุกสาขา
        </button>
      )}

      {isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />กำลังโหลด…</p>}
      {isError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{apiErrorMessage(error)}</p>}

      {data && (
        <>
          <TodayMoney m={data.total} />
          {data.branches.length > 1 && <BranchTable rows={data.branches} onPick={setPicked} />}
          <ToDo data={data} />
          <p className="text-right text-[11px] text-muted-foreground">
            อัปเดตเองทุก 1 นาที · ล่าสุด {new Date(dataUpdatedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </>
      )}

      <LineCard />
    </div>
  )
}

// ── Today's money ─────────────────────────────────────────────────────────────

function Card({ title, icon, right, children, className }: { title: string; icon: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-[#1E293B] sm:p-5', className)}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h2 className="flex-1 text-base font-bold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function TodayMoney({ m }: { m: BranchMoney }) {
  const loss = m.netProfit < 0
  return (
    <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
      <section className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white shadow-sm">
        <p className="text-sm text-slate-300">รายรับวันนี้</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">{formatThaiMoney(m.revenue)}</p>
        <p className="mt-1 text-xs text-slate-400">บิลขาย {m.bills} ใบ · รับเงินงานซ่อม {m.repairPayments} งาน</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'เงินสด', v: m.cash },
            { label: 'โอน / QR', v: m.transfer },
            { label: 'บัตร', v: m.card },
          ].map((x) => (
            <div key={x.label} className="rounded-xl bg-white/10 px-2 py-2">
              <p className="text-[11px] text-slate-300">{x.label}</p>
              <p className="text-sm font-bold tabular-nums">{formatThaiMoney(x.v)}</p>
            </div>
          ))}
        </div>
        <div className={cn('mt-4 rounded-xl px-3 py-2.5', loss ? 'bg-red-500/20' : 'bg-emerald-500/20')}>
          <p className="text-xs text-slate-200">กำไรสุทธิวันนี้ (หักทุนและค่าใช้จ่ายแล้ว)</p>
          <p className={cn('text-2xl font-bold tabular-nums', loss ? 'text-red-300' : 'text-emerald-300')}>
            {loss ? '− ' : ''}{formatThaiMoney(Math.abs(m.netProfit))}
          </p>
        </div>
      </section>

      <Card title="เงินออกวันนี้" icon="💸">
        <MoneyLine label="จ่ายออกจากลิ้นชัก" value={m.drawerOut} minus note="ค่าใช้จ่ายเงินสด จ่ายร้านอะไหล่ เบิกเงินออก" />
        <MoneyLine label="ค่าใช้จ่ายที่บันทึกวันนี้" value={m.expenses} minus note="ทุกช่องทาง รวมที่เจ้าของจ่ายเอง" />
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Link href="/reports/daily-closing" className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">
            ที่มาของเงินเข้า-ออก (ปิดวัน)<ChevronRight className="h-3 w-3" />
          </Link>
          <Link href="/reports/profit" className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">
            ที่มาของกำไร<ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </Card>
    </div>
  )
}

function BranchTable({ rows, onPick }: { rows: BranchMoney[]; onPick: (id: string) => void }) {
  const top = Math.max(1, ...rows.map((r) => r.revenue))
  return (
    <Card title="แยกตามสาขา" icon="🏪" right={<span className="text-xs text-muted-foreground">กดสาขาเพื่อดูเฉพาะสาขานั้น</span>}>
      <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
        {rows.map((b) => (
          <button key={b.branchId ?? b.name} type="button" onClick={() => b.branchId && onPick(b.branchId)}
            className="group flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{b.name}</p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${(b.revenue / top) * 100}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">สด {formatThaiMoney(b.cash)} · โอน {formatThaiMoney(b.transfer)}{b.card ? ` · บัตร ${formatThaiMoney(b.card)}` : ''}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold tabular-nums">{formatThaiMoney(b.revenue)}</p>
              <p className={cn('text-xs tabular-nums', b.netProfit < 0 ? 'text-red-600' : 'text-emerald-600')}>
                กำไร {b.netProfit < 0 ? '− ' : ''}{formatThaiMoney(Math.abs(b.netProfit))}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500" />
          </button>
        ))}
      </div>
    </Card>
  )
}

// ── What needs the owner ─────────────────────────────────────────────────────

function ToDo({ data }: { data: OwnerToday }) {
  const items = actionsOf(data.actions)
  return (
    <Card title={items.length ? `ต้องจัดการ ${items.length} เรื่อง` : 'ต้องจัดการ'} icon={items.length ? '⚠️' : '✅'}>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" />ไม่มีเรื่องค้างให้จัดการ</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.key} className={cn('rounded-xl border px-3 py-2.5', it.urgent ? 'border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-900/10' : 'border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-900/10')}>
              <Link href={it.href} className="group flex items-start gap-2">
                <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', it.urgent ? 'text-red-500' : 'text-amber-500')} />
                <span className="flex-1">
                  <span className="block text-sm font-semibold">{it.title}</span>
                  {it.hint && <span className="block text-xs text-muted-foreground">{it.hint}</span>}
                </span>
                <ChevronRight className="mt-0.5 h-4 w-4 text-slate-300 group-hover:text-blue-500" />
              </Link>
              {it.rows && it.rows.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-black/5 pt-2 dark:border-white/10">
                  {it.rows.map((r) => (
                    <li key={r.href + r.label}>
                      <Link href={r.href} className="flex items-baseline justify-between gap-2 text-xs hover:underline">
                        <span className="truncate"><span className={cn('font-semibold', r.code && 'font-mono')}>{r.label}</span> {r.sub}</span>
                        <span className="shrink-0 text-muted-foreground">{r.right}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ── LINE ──────────────────────────────────────────────────────────────────────

interface LineState { linked: boolean; dailySummary: boolean; preview: string }
interface LinkInfo { ready: boolean; linked: boolean; url: string | null; oaId: string | null }

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
  return (
    <Card title="สรุปยอดเข้า LINE ทุก 3 ทุ่ม" icon="💬">
      {link && !link.ready ? (
        <p className="text-sm text-muted-foreground">ระบบ LINE ของ FixITPro ยังไม่พร้อมใช้งาน</p>
      ) : !linked ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">เชื่อม LINE ของคุณครั้งเดียว แล้วทุก 3 ทุ่มระบบจะส่งยอดเงินวันนี้ กำไร และเรื่องที่ต้องจัดการ ไปให้ในแชต</p>
          {link?.url && (
            <a href={link.url} target="_blank" rel="noopener noreferrer"
              onClick={() => setTimeout(() => { qc.invalidateQueries({ queryKey: ['line-staff-link'] }); qc.invalidateQueries({ queryKey: ['owner-hub-line'] }) }, 15_000)}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
              <MessageCircle className="h-4 w-4" />เชื่อม LINE ของฉัน
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
            <span className="text-sm">
              <span className="block font-semibold">ส่งสรุปทุกวันเวลา 21:00</span>
              <span className="block text-xs text-muted-foreground">เชื่อม LINE แล้ว{link?.oaId ? ` (แชต ${link.oaId})` : ''}</span>
            </span>
            <input type="checkbox" className="h-5 w-5 accent-green-600" checked={data?.dailySummary ?? true}
              disabled={toggle.isPending} onChange={(e) => toggle.mutate(e.target.checked)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => test.mutate()} disabled={test.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">
              {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}ส่งให้ดูตอนนี้
            </button>
            <button type="button" onClick={() => setShowPreview((v) => !v)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              {showPreview ? 'ซ่อนตัวอย่าง' : 'ดูตัวอย่างข้อความ'}
            </button>
          </div>
        </div>
      )}
      {(showPreview || !linked) && data?.preview && (
        <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-900 p-3 font-sans text-xs leading-relaxed text-slate-100">{data.preview}</pre>
      )}
    </Card>
  )
}

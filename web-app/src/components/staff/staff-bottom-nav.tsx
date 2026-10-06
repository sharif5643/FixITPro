'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Wrench, ShoppingCart, Package, LayoutGrid, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppAccess } from '@/hooks/useAppAccess'

type TabAccess = keyof ReturnType<typeof useAppAccess>
const LEFT_TABS: { href: string; icon: React.ElementType; label: string; needs?: TabAccess }[] = [
  { href: '/staff/home',    icon: Home,         label: 'หน้าแรก'   },
  { href: '/staff/repairs', icon: Wrench,       label: 'งานซ่อม',  needs: 'repairs' },
]
const RIGHT_TABS: typeof LEFT_TABS = [
  { href: '/staff/pos',     icon: ShoppingCart, label: 'POS',      needs: 'pos'   },
  { href: '/staff/stock',   icon: Package,      label: 'สต็อก',    needs: 'stock' },
  { href: '/staff/more',    icon: LayoutGrid,   label: 'เพิ่มเติม' },
]

export function StaffBottomNav() {
  const pathname = usePathname()
  // Tabs follow the web menu's rules: a technician sees no POS, a shop without stock no สต็อก
  const access   = useAppAccess()
  const shown    = (t: (typeof LEFT_TABS)[number]) => !t.needs || access[t.needs]
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  function Tab({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
    const active = isActive(href)
    return (
      <Link href={href} className="flex flex-1 flex-col items-center justify-center gap-1 py-2">
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-xl transition-colors', active ? 'bg-brand-yellow' : '')}>
          <Icon className={cn('h-5 w-5', active ? 'text-brand-on-yellow' : 'text-slate-400')} strokeWidth={active ? 2.5 : 1.8}/>
        </div>
        <span className={cn('text-[10px] font-semibold leading-none', active ? 'text-brand-black' : 'text-slate-400')}>
          {label}
        </span>
      </Link>
    )
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 rounded-t-3xl border-t border-slate-100 bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.08)]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex h-[70px] items-end">
        {/* Left tabs */}
        {LEFT_TABS.filter(shown).map(({ needs: _n, ...t }) => <Tab key={t.href} {...t}/>)}

        {/* FAB center */}
        {access.intake ? <div className="flex flex-1 flex-col items-center">
          <Link
            href="/staff/create"
            className="flex flex-col items-center gap-1"
            style={{ marginTop: '-20px' }}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-yellow shadow-[0_4px_16px_rgb(var(--brand-accent)/0.55)] transition-transform active:scale-95">
              <Plus className="h-7 w-7 text-brand-on-yellow" strokeWidth={2.5}/>
            </div>
            <span className="mb-1 text-[10px] font-semibold text-slate-400">รับงาน</span>
          </Link>
        </div> : null}

        {/* Right tabs */}
        {RIGHT_TABS.filter(shown).map(({ needs: _n, ...t }) => <Tab key={t.href} {...t}/>)}
      </div>
    </nav>
  )
}

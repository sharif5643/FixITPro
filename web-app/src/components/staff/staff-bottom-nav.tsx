'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Wrench, Plus, MessageCircle, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const LEFT_ITEMS = [
  { href: '/staff/home',    icon: Home,          label: 'หน้าแรก'  },
  { href: '/staff/repairs', icon: Wrench,        label: 'งานซ่อม'  },
]

const RIGHT_ITEMS = [
  { href: '/staff/chat',    icon: MessageCircle, label: 'ข้อความ'  },
  { href: '/staff/profile', icon: User,          label: 'โปรไฟล์'  },
]

export function StaffBottomNav() {
  const pathname = usePathname()

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-100 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
      <div className="relative flex h-[60px] items-end pb-2">
        {/* Left items */}
        {LEFT_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 pb-1"
            >
              <Icon
                className={cn('h-5 w-5', active ? 'text-brand-black' : 'text-slate-400')}
                strokeWidth={active ? 2.5 : 1.8}
              />
              <span className={cn('text-[10px] font-medium leading-none', active ? 'text-brand-black' : 'text-slate-400')}>
                {label}
              </span>
            </Link>
          )
        })}

        {/* Center FAB — แจ้งซ่อม */}
        <div className="flex-1 flex flex-col items-center justify-end pb-1">
          <Link
            href="/staff/create"
            className={cn(
              'absolute bottom-3 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95',
              isActive('/staff/create')
                ? 'bg-brand-yellow'
                : 'bg-brand-black',
            )}
          >
            <Plus className="h-7 w-7 text-white" strokeWidth={2.5} />
          </Link>
          {/* Invisible spacer so flex distributes correctly */}
          <span className="text-[10px] invisible">+</span>
        </div>

        {/* Right items */}
        {RIGHT_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 pb-1"
            >
              <Icon
                className={cn('h-5 w-5', active ? 'text-brand-black' : 'text-slate-400')}
                strokeWidth={active ? 2.5 : 1.8}
              />
              <span className={cn('text-[10px] font-medium leading-none', active ? 'text-brand-black' : 'text-slate-400')}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

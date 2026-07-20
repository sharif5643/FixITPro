'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useQuery } from '@tanstack/react-query'
import { Menu, AlertTriangle, Sun, Moon, LogOut, User, ChevronDown } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useShopName } from '@/hooks/useShopName'
import { NotificationBell } from '@/components/layout/notification-bell'
import { BranchSelector } from '@/components/layout/branch-selector'
import { SyncStatusIndicator } from '@/components/layout/sync-status-indicator'
import { QuickSearch } from '@/components/layout/quick-search'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FiAvatar } from '@/components/fi/avatar'
import { FiBadge } from '@/components/fi/badge'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

const roleLabel: Record<string, string> = {
  OWNER:       'เจ้าของร้าน',
  MANAGER:     'ผู้จัดการ',
  CASHIER:     'แคชเชียร์',
  TECHNICIAN:  'ช่างซ่อม',
  STOCK_STAFF: 'พนักงานสต็อก',
}

interface TopBarProps {
  onMenuToggle: () => void
}

export function TopBar({ onMenuToggle }: TopBarProps) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { user, clearAuth } = useAuthStore()
  const shopName = useShopName()

  useEffect(() => {
    document.title = `${shopName} - FixITPro`
  }, [shopName])

  const isShopUser = user?.role !== 'SUPER_ADMIN'
  const { data: currentShift, isLoading: shiftLoading } = useQuery<{ id: string } | null>({
    queryKey: ['shifts', 'current'],
    queryFn: async () => (await api.get('/shifts/current')).data,
    staleTime: 30_000,
    enabled: isShopUser,
  })

  const handleLogout = async () => {
    try { await api.post('/auth/logout') } catch { /* best-effort */ }
    clearAuth()
    router.push('/login')
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--fi-border,#E2E8F0)] bg-white dark:bg-[#111827] px-3 sm:px-5 flex-shrink-0 transition-colors">
      {/* Left: hamburger + shop name */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onMenuToggle}
          className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors flex-shrink-0"
          aria-label="เปิดเมนู"
        >
          <Menu className="h-5 w-5 text-slate-600 dark:text-slate-300" />
        </button>

        <div className="hidden md:flex items-center gap-2.5 min-w-0">
          <span className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[180px]">
            {shopName}
          </span>
          <FiBadge variant="primary" size="sm">
            {roleLabel[user?.role ?? ''] ?? user?.role}
          </FiBadge>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
        <div className="hidden sm:flex">
          <QuickSearch />
        </div>

        {/* No-shift warning */}
        {isShopUser && !shiftLoading && !currentShift && (
          <Link href="/shifts">
            <span className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold',
              'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
              'border border-amber-200 dark:border-amber-800',
              'hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors cursor-pointer',
            )}>
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="hidden sm:inline">ยังไม่เปิดกะ</span>
            </span>
          </Link>
        )}

        <BranchSelector />
        <SyncStatusIndicator />
        <NotificationBell />

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="h-9 w-9 inline-flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors text-slate-500 dark:text-slate-400"
          aria-label="สลับธีม"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors focus:outline-none">
              <FiAvatar name={user?.name ?? 'U'} size="sm" />
              <div className="text-left hidden sm:block">
                <p className="text-xs font-semibold text-slate-900 dark:text-white leading-none">{user?.name}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 max-w-[100px] truncate">{user?.email}</p>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 hidden sm:block" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <div className="flex items-center gap-2.5 py-1">
                <FiAvatar name={user?.name ?? 'U'} size="md" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{user?.name}</p>
                  <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer">
              <User className="mr-2 h-4 w-4" />โปรไฟล์
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="cursor-pointer"
            >
              {theme === 'dark'
                ? <><Sun className="mr-2 h-4 w-4" />โหมดสว่าง</>
                : <><Moon className="mr-2 h-4 w-4" />โหมดมืด</>
              }
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20 cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />ออกจากระบบ
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

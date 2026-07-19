'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useQuery } from '@tanstack/react-query'
import { LogOut, User, ChevronDown, Menu, AlertTriangle, Sun, Moon } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useShopName } from '@/hooks/useShopName'
import { NotificationBell } from '@/components/layout/notification-bell'
import { BranchSelector } from '@/components/layout/branch-selector'
import { SyncStatusIndicator } from '@/components/layout/sync-status-indicator'
import { QuickSearch } from '@/components/layout/quick-search'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import api from '@/lib/api'

const roleLabel: Record<string, string> = {
  OWNER:       'เจ้าของร้าน',
  MANAGER:     'ผู้จัดการ',
  CASHIER:     'แคชเชียร์',
  TECHNICIAN:  'ช่างซ่อม',
  STOCK_STAFF: 'พนักงานสต็อก',
}

interface HeaderProps {
  onMenuToggle: () => void
}

export function Header({ onMenuToggle }: HeaderProps) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { user, clearAuth } = useAuthStore()

  const shopName = useShopName()

  useEffect(() => {
    document.title = `${shopName} - ระบบร้านมือถือ`
  }, [shopName])

  const isShopUser = user?.role !== 'SUPER_ADMIN'
  const { data: currentShift, isLoading: shiftLoading } = useQuery<{ id: string } | null>({
    queryKey: ['shifts', 'current'],
    queryFn: async () => (await api.get('/shifts/current')).data,
    staleTime: 30_000,
    enabled: isShopUser,
  })

  const handleLogout = async () => {
    // CHB-01: clear server-side cookie first, then local state
    try { await api.post('/auth/logout') } catch { /* best-effort — always clear local state */ }
    clearAuth()
    router.push('/login')
  }

  const initials =
    user?.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U'

  return (
    <header className="flex h-14 items-center justify-between border-b bg-white dark:bg-[#1E293B] dark:border-slate-700/60 px-3 sm:px-6 shadow-sm flex-shrink-0 transition-colors">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-9 w-9"
          onClick={onMenuToggle}
          aria-label="เปิดเมนู"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <span className="hidden md:block text-sm font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">
          {shopName}
        </span>

        <Badge variant="secondary" className="text-xs font-normal hidden sm:inline-flex">
          {roleLabel[user?.role || ''] || user?.role}
        </Badge>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <QuickSearch />

        {isShopUser && !shiftLoading && !currentShift && (
          <Link href="/shifts">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400 text-xs px-2 sm:px-3"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">ยังไม่เปิดกะ</span>
            </Button>
          </Link>
        )}

        <BranchSelector />
        <SyncStatusIndicator />
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 h-auto px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Avatar className="h-7 w-7 sm:h-8 sm:w-8">
                <AvatarFallback className="bg-blue-600 text-white text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="text-left hidden sm:block">
                <p className="text-sm font-semibold leading-none">{user?.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-[140px] truncate">{user?.email}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400 ml-1 hidden sm:block" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              โปรไฟล์
            </DropdownMenuItem>

            {/* Dark / Light mode toggle */}
            <DropdownMenuItem
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="cursor-pointer"
            >
              {theme === 'dark'
                ? <><Sun  className="mr-2 h-4 w-4" />โหมดสว่าง</>
                : <><Moon className="mr-2 h-4 w-4" />โหมดมืด</>
              }
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={handleLogout}
              className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20 cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              ออกจากระบบ
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

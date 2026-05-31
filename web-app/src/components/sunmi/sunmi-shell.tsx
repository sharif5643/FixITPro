'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { MobileBottomNav } from './mobile-bottom-nav'

interface SunmiShellProps {
  title: string
  children: React.ReactNode
  showBack?: boolean
  /** Override the default router.back() behaviour for the back button */
  onBack?: () => void
  rightContent?: React.ReactNode
  /** Rendered between the top bar and the scroll area (stays visible, does not scroll) */
  aboveScroll?: React.ReactNode
  /** Rendered below the scroll area (stays visible, does not scroll) */
  belowScroll?: React.ReactNode
  /** Show the persistent mobile bottom navigation bar */
  showBottomNav?: boolean
}

/**
 * Full-screen SUNMI shell: dark top bar + scrollable body.
 * No sidebar, no desktop header — optimised for vertical POS screen.
 */
export function SunmiShell({
  title,
  children,
  showBack = true,
  onBack,
  rightContent,
  aboveScroll,
  belowScroll,
  showBottomNav = true,
}: SunmiShellProps) {
  const router = useRouter()

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center h-14 px-2 bg-slate-900 shrink-0 select-none">
        {showBack ? (
          <button
            onClick={() => onBack ? onBack() : router.back()}
            className="flex items-center justify-center h-11 w-11 rounded-xl text-slate-300 active:bg-slate-700 transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : (
          <div className="w-11" />
        )}
        <h1 className="flex-1 text-center text-white font-bold text-lg truncate px-1">{title}</h1>
        <div className="w-11 flex justify-center">{rightContent}</div>
      </header>

      {/* Sticky strip above scrollable area */}
      {aboveScroll && <div className="shrink-0">{aboveScroll}</div>}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>

      {/* Sticky strip below scrollable area */}
      {belowScroll && <div className="shrink-0">{belowScroll}</div>}

      {/* Persistent bottom navigation */}
      {showBottomNav && <MobileBottomNav />}
    </div>
  )
}

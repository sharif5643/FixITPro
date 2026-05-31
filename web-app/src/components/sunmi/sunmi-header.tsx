'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

interface SunmiHeaderProps {
  title: string
  showBack?: boolean
  onBack?: () => void
  rightContent?: React.ReactNode
}

/** Standalone SUNMI top bar — use inside custom page layouts that don't use SunmiShell. */
export function SunmiHeader({
  title,
  showBack = true,
  onBack,
  rightContent,
}: SunmiHeaderProps) {
  const router = useRouter()

  return (
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
  )
}

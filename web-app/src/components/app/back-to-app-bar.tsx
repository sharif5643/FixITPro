'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { clearOpenedFromApp, openedFromApp } from '@/lib/app-shell'

/** On web pages opened from the SUNMI / staff app: one tap back to the app screen. */
export function BackToAppBar() {
  const router = useRouter()
  const [returnTo, setReturnTo] = useState<string | null>(null)
  useEffect(() => { setReturnTo(openedFromApp()) }, [])
  if (!returnTo) return null
  return (
    <button
      onClick={() => { clearOpenedFromApp(); router.replace(returnTo) }}
      className="flex w-full items-center gap-2 bg-slate-900 px-4 py-2.5 pt-[calc(env(safe-area-inset-top)+10px)] text-sm font-semibold text-white"
    >
      <ArrowLeft className="h-4 w-4" /> กลับหน้าจอแอป
    </button>
  )
}

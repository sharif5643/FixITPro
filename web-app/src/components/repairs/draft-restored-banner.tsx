'use client'

import { History } from 'lucide-react'

/** Shown when a half-filled intake form came back from the last time; one tap starts over. */
export function DraftRestoredBanner({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-200">
      <History className="h-4 w-4 shrink-0" />
      <span className="flex-1">กรอกค้างไว้จากครั้งก่อน — ข้อมูลยังอยู่ครบ (ยกเว้นรูป)</span>
      <button type="button" onClick={onClear} className="shrink-0 font-semibold underline underline-offset-2">
        เริ่มใหม่
      </button>
    </div>
  )
}

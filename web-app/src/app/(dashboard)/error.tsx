'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to your error tracking service here if needed
    console.error('[Dashboard Error]', error.message)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">เกิดข้อผิดพลาด</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {error.message || 'ระบบเกิดข้อผิดพลาดที่ไม่คาดคิด'}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono mt-1">
            ID: {error.digest}
          </p>
        )}
      </div>
      <Button onClick={reset} variant="outline" className="gap-2">
        <RefreshCw className="h-4 w-4" />
        ลองใหม่
      </Button>
    </div>
  )
}

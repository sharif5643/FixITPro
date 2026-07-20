'use client'

import { useRouter } from 'next/navigation'
import { ShieldOff, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ForbiddenPage() {
  const router = useRouter()
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-20">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
        <ShieldOff className="h-8 w-8 text-red-500" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">ไม่มีสิทธิ์เข้าถึง</h1>
        <p className="text-muted-foreground mt-1 text-sm">คุณไม่มีสิทธิ์ในการเข้าถึงหน้านี้ กรุณาติดต่อผู้ดูแลระบบ</p>
      </div>
      <Button variant="outline" onClick={() => router.back()} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        กลับหน้าก่อนหน้า
      </Button>
    </div>
  )
}

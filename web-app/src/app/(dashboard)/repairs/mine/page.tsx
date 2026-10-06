'use client'

import { useRouter } from 'next/navigation'
import { Hammer } from 'lucide-react'
import { MyRepairsBoard } from '@/components/repairs/my-repairs-board'

/** "งานซ่อมของฉัน" on the web, for anyone who does repair work beside their own role. */
export default function MyRepairsPage() {
  const router = useRouter()
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
          <Hammer className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">งานซ่อมของฉัน</h1>
          <p className="text-xs text-slate-500">งานที่คุณรับไว้ · งานกลางที่ยังไม่มีช่าง · ค้นหางานทั้งหมด</p>
        </div>
      </div>
      <MyRepairsBoard openJob={(id) => router.push(`/repairs/${id}`)} />
    </div>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { SunmiShell } from '@/components/sunmi/sunmi-shell'
import { MyRepairsBoard } from '@/components/repairs/my-repairs-board'
import { useAppShell } from '@/lib/app-shell'

/** "งานซ่อมของฉัน" on SUNMI, for technicians and anyone the owner made a technician. */
export default function SunmiMyRepairsPage() {
  const router = useRouter()
  const { to } = useAppShell()
  return (
    <SunmiShell title="งานซ่อมของฉัน">
      <div className="p-4">
        <MyRepairsBoard openJob={(id) => router.push(`${to('/sunmi/repairs')}?open=${encodeURIComponent(id)}`)} />
      </div>
    </SunmiShell>
  )
}

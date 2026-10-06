'use client'

export const dynamic = 'force-dynamic'

import { useSearchParams } from 'next/navigation'
import { FormalDocSheet } from '@/components/formal/formal-doc-sheet'

/**
 * The formal-document sheet on its own page. The web repair dialog opens this in a new tab,
 * because a sheet laid over a modal dialog cannot take clicks or typing.
 */
export default function FormalIssuePage() {
  const params = useSearchParams()
  const repairId = params.get('repairId')
  const customerId = params.get('customerId')
  if (!repairId && !customerId) return <p className="p-10 text-center text-red-600">ไม่ได้ระบุงานซ่อม</p>
  return (
    <FormalDocSheet
      repairId={repairId}
      customerId={customerId}
      onClose={() => { window.close(); history.back() }}
    />
  )
}

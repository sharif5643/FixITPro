'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { usePermission } from '@/hooks/use-permission'

interface PermissionGateProps {
  permission: string
  children: React.ReactNode
}

export function PermissionGate({ permission, children }: PermissionGateProps) {
  const router = useRouter()
  const allowed = usePermission(permission)

  useEffect(() => {
    if (!allowed) router.replace('/403')
  }, [allowed, router])

  if (!allowed) return null
  return <>{children}</>
}

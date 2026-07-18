'use client'

import { useAuthStore } from '@/store/auth.store'
import type { ReactNode } from 'react'

interface PermissionGateProps {
  permission: string
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Renders children only if the current user has the given permission.
 * OWNER and SUPER_ADMIN always pass.
 * Falls back to `fallback` (default: null) if permission is denied.
 */
export function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const has = useAuthStore((s) => s.hasPermission)
  if (!has(permission)) return <>{fallback}</>
  return <>{children}</>
}

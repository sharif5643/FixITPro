import { useAuthStore } from '@/store/auth.store'

export function usePermission(permission: string): boolean {
  return useAuthStore((s) => s.hasPermission(permission))
}

export function usePermissions(): {
  has: (permission: string) => boolean
  isOwner: boolean
  role: string | undefined
} {
  const user = useAuthStore((s) => s.user)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  return {
    has: hasPermission,
    isOwner: user?.role === 'OWNER',
    role: user?.role,
  }
}

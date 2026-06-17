import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import type { ShopSettings } from '@/types'

export function useShopName(): string {
  const role = useAuthStore((s) => s.user?.role)
  const isSuperAdmin = role === 'SUPER_ADMIN'

  const { data } = useQuery<ShopSettings>({
    queryKey: ['shop-settings'],
    queryFn: async () => (await api.get('/settings/shop')).data,
    staleTime: 5 * 60_000,
    enabled: !isSuperAdmin,
  })

  if (isSuperAdmin) return 'FixITPro'
  return data?.shopName ?? 'FixITPro'
}

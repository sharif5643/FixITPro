import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import type { ShopSettings } from '@/types'

export function useShopName(): string {
  const role = useAuthStore((s) => s.user?.role)
  const tenantName = useAuthStore((s) => s.user?.shopName)
  const isSuperAdmin = role === 'SUPER_ADMIN'

  const { data } = useQuery<ShopSettings>({
    queryKey: ['shop-settings'],
    queryFn: async () => (await api.get('/settings/shop')).data,
    staleTime: 5 * 60_000,
    enabled: !isSuperAdmin,
  })

  if (isSuperAdmin) return 'FixITPro'
  // Settings start out as the placeholder "FixITPro"; until the owner sets a name, show the
  // shop's registered name instead of the product name.
  const fromSettings = data?.shopName?.trim()
  if (fromSettings && fromSettings !== 'FixITPro') return fromSettings
  return tenantName?.trim() || fromSettings || 'FixITPro'
}

/** The shop's logo for the menu header (null until the owner sets one). */
export function useShopLogo(): string | null {
  const role = useAuthStore((s) => s.user?.role)
  const { data } = useQuery<ShopSettings>({
    queryKey: ['shop-settings'],
    queryFn: async () => (await api.get('/settings/shop')).data,
    staleTime: 5 * 60_000,
    enabled: !!role && role !== 'SUPER_ADMIN',
  })
  return data?.logoUrl || null
}

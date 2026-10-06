'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { BRAND_CACHE_KEY, applyBrandColor, isHexColor } from '@/lib/brand-theme'

interface ShopLook { themeColor?: string | null; themePreset?: string | null }

/**
 * Applies the shop's main colour and light / dark choice for everyone signed in to that shop.
 * The last colour is remembered on the device so the app opens in it without a flash.
 */
export function BrandTheme() {
  const user = useAuthStore((s) => s.user)
  const shopUser = !!user && user.role !== 'SUPER_ADMIN'
  const { setTheme } = useTheme()

  // Paint the remembered colour before the shop's settings arrive
  useEffect(() => {
    try {
      const cached = localStorage.getItem(BRAND_CACHE_KEY)
      if (isHexColor(cached)) applyBrandColor(cached)
    } catch { /* storage blocked */ }
  }, [])

  const { data } = useQuery<ShopLook>({
    queryKey: ['shop-settings'],
    queryFn:  async () => (await api.get('/settings/shop')).data,
    staleTime: 5 * 60_000,
    enabled:  shopUser,
  })

  useEffect(() => {
    if (!shopUser) {
      applyBrandColor(null)
      try { localStorage.removeItem(BRAND_CACHE_KEY) } catch { /* ignore */ }
      return
    }
    if (!data) return
    const color = isHexColor(data.themeColor) ? data.themeColor : null
    applyBrandColor(color)
    try {
      if (color) localStorage.setItem(BRAND_CACHE_KEY, color)
      else localStorage.removeItem(BRAND_CACHE_KEY)
      // The shop's light / dark choice is the starting point; a person's own toggle wins on their device
      if (data.themePreset && !localStorage.getItem('theme')) {
        setTheme(data.themePreset === 'auto' ? 'system' : data.themePreset)
      }
    } catch { /* storage blocked */ }
  }, [data, shopUser, setTheme])

  return null
}

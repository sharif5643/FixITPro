'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { BRAND_CACHE_KEY, applyThemeSet } from '@/lib/brand-theme'

interface ShopLook { themeKey?: string | null; themePreset?: string | null }

/**
 * Applies the shop's theme set and light / dark choice for everyone signed in to that shop.
 * No theme set (or "original") = the product's own look, untouched. The last set is remembered
 * on the device so the app opens in it without a flash.
 */
export function BrandTheme() {
  const user = useAuthStore((s) => s.user)
  const shopUser = !!user && user.role !== 'SUPER_ADMIN'
  const { setTheme } = useTheme()

  useEffect(() => {
    try { applyThemeSet(localStorage.getItem(BRAND_CACHE_KEY)) } catch { /* storage blocked */ }
  }, [])

  const { data } = useQuery<ShopLook>({
    queryKey: ['shop-settings'],
    queryFn:  async () => (await api.get('/settings/shop')).data,
    staleTime: 5 * 60_000,
    enabled:  shopUser,
  })

  useEffect(() => {
    if (!shopUser) {
      applyThemeSet(null)
      try { localStorage.removeItem(BRAND_CACHE_KEY) } catch { /* ignore */ }
      return
    }
    if (!data) return
    applyThemeSet(data.themeKey)
    try {
      if (data.themeKey && data.themeKey !== 'original') localStorage.setItem(BRAND_CACHE_KEY, data.themeKey)
      else localStorage.removeItem(BRAND_CACHE_KEY)
      // The shop's light / dark choice is the starting point; a person's own toggle wins on their device
      if (data.themePreset && !localStorage.getItem('theme')) {
        setTheme(data.themePreset === 'auto' ? 'system' : data.themePreset)
      }
    } catch { /* storage blocked */ }
  }, [data, shopUser, setTheme])

  return null
}

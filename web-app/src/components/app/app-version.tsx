'use client'

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'

/** The installed app's real version (from the APK); in a browser, just the product name. */
export function AppVersion({ className }: { className?: string }) {
  const [label, setLabel] = useState('FixITPro')
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    import('@capacitor/app')
      .then(({ App }) => App.getInfo())
      .then((i) => setLabel(`${i.name} ${i.version} (${i.build})`))
      .catch(() => {})
  }, [])
  return <p className={className}>{label}</p>
}

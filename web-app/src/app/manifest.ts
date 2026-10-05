import type { MetadataRoute } from 'next'

/**
 * Lets phones, tablets and computers install FixITPro from the browser ("Add to Home screen" /
 * "Install app"). It opens like an app, full screen, on the login page; a signed-in user goes
 * straight on to their own screens.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FixITPro — ระบบร้านมือถือ',
    short_name: 'FixITPro',
    description: 'ระบบจัดการร้านมือถือ ขาย ซ่อม สต็อก',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0f172a',
    theme_color: '#FF8A00',
    lang: 'th',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}

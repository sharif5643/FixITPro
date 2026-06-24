import type { Metadata } from 'next'
import { Inter, Noto_Sans_Thai, Prompt } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'

const inter = Inter({
  subsets:  ['latin'],
  variable: '--font-inter',
  display:  'swap',
})

const notoSansThai = Noto_Sans_Thai({
  subsets:  ['thai'],
  variable: '--font-noto-thai',
  weight:   ['400', '500', '600', '700'],
  display:  'swap',
})

const prompt = Prompt({
  subsets:  ['thai', 'latin'],
  variable: '--font-prompt',
  weight:   ['400', '500', '600', '700', '800'],
  display:  'swap',
})

export const metadata: Metadata = {
  title:       'FixITPro - ระบบร้านมือถือ',
  description: 'ระบบจัดการร้านมือถือ ขาย ซ่อม อุปกรณ์',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // suppressHydrationWarning is required for next-themes class injection
    <html lang="th" suppressHydrationWarning>
      <body className={`${inter.variable} ${notoSansThai.variable} ${prompt.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

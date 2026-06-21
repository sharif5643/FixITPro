'use client'

import { usePathname } from 'next/navigation'
import { PublicNavbar } from '@/components/public/navbar'
import { PublicFooter } from '@/components/public/footer'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // /track pages are a standalone customer portal — skip marketing nav/footer
  if (pathname.startsWith('/track')) {
    return <>{children}</>
  }
  return (
    <div className="min-h-screen flex flex-col">
      <PublicNavbar />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  )
}

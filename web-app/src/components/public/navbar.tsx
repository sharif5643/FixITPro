'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'

const navLinks = [
  { href: '/features', label: 'ฟีเจอร์' },
  { href: '/pricing',  label: 'ราคา' },
  { href: '/about',    label: 'เกี่ยวกับ' },
  { href: '/contact',  label: 'ติดต่อ' },
]

export function PublicNavbar() {
  const pathname  = usePathname()
  const [open, setOpen]       = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => { setOpen(false) }, [pathname])

  return (
    <header className={cn(
      'fixed top-0 inset-x-0 z-50 transition-all duration-300',
      scrolled
        ? 'bg-white/90 backdrop-blur-md border-b border-slate-200/60 shadow-sm'
        : 'bg-transparent',
    )}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 shadow-lg shadow-blue-500/30 group-hover:shadow-blue-500/50 transition-shadow">
              <Wrench className="h-4 w-4 text-white" />
            </div>
            <span className={cn(
              'text-lg font-bold tracking-tight transition-colors',
              scrolled ? 'text-slate-900' : 'text-white',
            )}>
              FixIT<span className="text-blue-400">Pro</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  pathname === l.href
                    ? scrolled ? 'bg-blue-50 text-blue-700' : 'bg-white/15 text-white'
                    : scrolled ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100' : 'text-white/80 hover:text-white hover:bg-white/10',
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/login"
              className={cn(
                'text-sm font-medium transition-colors px-4 py-2 rounded-lg',
                scrolled ? 'text-slate-600 hover:text-slate-900' : 'text-white/80 hover:text-white',
              )}
            >
              เข้าสู่ระบบ
            </Link>
            <Link
              href="/register"
              className="text-sm font-semibold px-5 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:opacity-90 transition-all"
            >
              ทดลองใช้ฟรี 30 วัน
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className={cn('md:hidden p-2 rounded-lg transition-colors', scrolled ? 'text-slate-700 hover:bg-slate-100' : 'text-white hover:bg-white/10')}
            onClick={() => setOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-white border-b border-slate-200 shadow-lg">
          <div className="px-4 py-4 space-y-1">
            {navLinks.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  pathname === l.href
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-700 hover:bg-slate-50',
                )}
              >
                {l.label}
              </Link>
            ))}
            <div className="pt-3 flex flex-col gap-2 border-t border-slate-100 mt-3">
              <Link href="/login" className="block text-center px-4 py-2.5 rounded-lg text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors">
                เข้าสู่ระบบ
              </Link>
              <Link href="/register" className="block text-center px-4 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-blue-600 to-purple-600 text-white">
                ทดลองใช้ฟรี 30 วัน
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

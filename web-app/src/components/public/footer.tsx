import Link from 'next/link'
import { Wrench } from 'lucide-react'

export function PublicFooter() {
  return (
    <footer className="bg-slate-900 text-slate-400">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">

          {/* Brand */}
          <div className="col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600">
                <Wrench className="h-4 w-4 text-white" />
              </div>
              <span className="text-lg font-bold text-white">FixIT<span className="text-blue-400">Pro</span></span>
            </Link>
            <p className="text-sm leading-relaxed text-slate-400 max-w-xs">
              ระบบจัดการร้านมือถือครบวงจร ขาย ซ่อม สต็อก ในระบบเดียว
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">ผลิตภัณฑ์</h3>
            <ul className="space-y-3">
              {[
                { href: '/features', label: 'ฟีเจอร์ทั้งหมด' },
                { href: '/pricing',  label: 'ราคาและแพ็กเกจ' },
                { href: '/register', label: 'ทดลองใช้ฟรี' },
              ].map(l => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm hover:text-white transition-colors">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">บริษัท</h3>
            <ul className="space-y-3">
              {[
                { href: '/about',   label: 'เกี่ยวกับเรา' },
                { href: '/contact', label: 'ติดต่อเรา' },
                { href: '/billing', label: 'ต่ออายุบริการ' },
              ].map(l => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm hover:text-white transition-colors">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">ติดต่อ</h3>
            <ul className="space-y-3 text-sm">
              <li>LINE: <span className="text-slate-300">@fixitpro</span></li>
              <li>Facebook: <span className="text-slate-300">FixITPro</span></li>
              <li>Email: <span className="text-slate-300">support@fixitpro.app</span></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} FixITPro. All rights reserved.</p>
          <p className="text-xs text-slate-500">ระบบจัดการร้านมือถือสำหรับธุรกิจไทย</p>
        </div>
      </div>
    </footer>
  )
}

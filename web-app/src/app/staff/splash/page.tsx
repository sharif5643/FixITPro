'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench } from 'lucide-react'

export default function StaffSplashPage() {
  const router = useRouter()
  const [dot, setDot] = useState(0)

  useEffect(() => {
    const anim = setInterval(() => setDot((d) => (d + 1) % 3), 450)
    const nav  = setTimeout(() => router.replace('/staff/login'), 2600)
    return () => { clearInterval(anim); clearTimeout(nav) }
  }, [router])

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-brand-black px-6 py-16">
      {/* Center logo */}
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <div className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-brand-yellow shadow-[0_8px_32px_rgba(255,193,7,0.4)]">
          <Wrench className="h-12 w-12 text-brand-black" strokeWidth={2.5} />
        </div>

        <div className="flex flex-col items-center gap-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-white">
            FixIT<span className="text-brand-yellow">Pro</span>
          </h1>
          <p className="text-center text-sm font-medium text-white/60 leading-relaxed">
            ระบบจัดการร้านมือถือครบวงจร
          </p>
          <p className="text-center text-xs text-white/40">
            ขาย • ซ่อม • สต็อก • ลูกค้า ในระบบเดียว
          </p>
        </div>
      </div>

      {/* Bottom */}
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-2 w-2 rounded-full transition-colors duration-300"
              style={{ backgroundColor: dot === i ? '#FFC107' : 'rgba(255,255,255,0.2)' }}
            />
          ))}
        </div>
        <p className="text-xs text-white/30">v2.0.0</p>
      </div>
    </div>
  )
}

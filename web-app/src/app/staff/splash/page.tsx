'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SplashPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<'loading' | 'shake'>('loading')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // Animate progress bar
    const step = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) { clearInterval(step); return 100 }
        return p + 2
      })
    }, 40)

    // Shake then navigate
    const shakeTimer = setTimeout(() => setPhase('shake'), 1900)
    const navTimer   = setTimeout(() => router.replace('/staff/login'), 2500)
    return () => { clearInterval(step); clearTimeout(shakeTimer); clearTimeout(navTimer) }
  }, [router])

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-[#111111] px-8 pb-12 pt-20 select-none overflow-hidden">

      {/* Center section */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6">

        {/* Logo box */}
        <div className={`relative ${phase === 'shake' ? 'anim-shake' : ''}`}>
          <div className="anim-logo relative flex h-28 w-28 items-center justify-center rounded-[28px] bg-brand-yellow shadow-[0_0_60px_rgba(255,193,7,0.5)]">
            {/* Wrench + cross icon */}
            <svg viewBox="0 0 64 64" fill="none" className="h-14 w-14" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 50L28 36" stroke="#111" strokeWidth="4.5" strokeLinecap="round"/>
              <circle cx="38" cy="22" r="12" stroke="#111" strokeWidth="4.5"/>
              <path d="M26 34L14 50" stroke="#111" strokeWidth="4.5" strokeLinecap="round"/>
              <path d="M44 16L32 28" stroke="#111" strokeWidth="4.5" strokeLinecap="round"/>
            </svg>
            {/* Light sweep */}
            <div className="anim-sweep pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]">
              <div className="absolute top-0 h-full w-16 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            </div>
          </div>
        </div>

        {/* App name */}
        <div className="anim-text flex flex-col items-center gap-1.5">
          <h1 className="text-5xl font-extrabold tracking-tight text-white">
            FixIT<span className="text-brand-yellow">+</span>
          </h1>
          <p className="anim-sub text-sm font-medium text-white/50 tracking-wide">
            ระบบจัดการร้านมือถือครบวงจร
          </p>
        </div>
      </div>

      {/* Bottom */}
      <div className="anim-loading flex w-full flex-col items-center gap-4">
        {/* Progress bar */}
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-brand-yellow transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-white/40 tracking-widest">กำลังเตรียมระบบ...</p>
        <p className="text-[10px] text-white/20">Version 2.0.0</p>
      </div>
    </div>
  )
}

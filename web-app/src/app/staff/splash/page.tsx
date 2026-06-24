'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench } from 'lucide-react'

export default function StaffSplashPage() {
  const router = useRouter()

  useEffect(() => {
    const t = setTimeout(() => router.replace('/staff/login'), 2200)
    return () => clearTimeout(t)
  }, [router])

  return (
    <div className="flex h-screen flex-col items-center justify-between bg-black px-8 py-16">
      {/* Logo + name */}
      <div className="flex flex-1 flex-col items-center justify-center gap-5 animate-fade-up">
        {/* Icon mark */}
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-brand-yellow shadow-[0_8px_32px_rgba(245,194,0,0.35)]">
          <Wrench className="h-12 w-12 text-black" strokeWidth={2.2} />
        </div>

        <div className="text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-white">FixITPro</h1>
          <p className="mt-2 text-sm font-medium text-slate-400 tracking-wide">
            บริการช่าง ครบ จบ ในที่เดียว
          </p>
        </div>
      </div>

      {/* 3 dots progress */}
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-2 w-2 rounded-full animate-pulse"
            style={{
              backgroundColor: i === 0 ? '#F5C200' : '#3f3f46',
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

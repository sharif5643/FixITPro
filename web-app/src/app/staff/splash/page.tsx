'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'

/* ─── Circuit board SVG background ─────────────────────────────────────── */
function CircuitBg() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <line x1="0"    y1="15%"  x2="30%"  y2="15%"  stroke="#FFC107" strokeWidth="1"/>
      <line x1="30%"  y1="15%"  x2="30%"  y2="30%"  stroke="#FFC107" strokeWidth="1"/>
      <line x1="30%"  y1="30%"  x2="65%"  y2="30%"  stroke="#FFC107" strokeWidth="1"/>
      <line x1="65%"  y1="30%"  x2="65%"  y2="18%"  stroke="#FFC107" strokeWidth="1"/>
      <line x1="65%"  y1="18%"  x2="100%" y2="18%"  stroke="#FFC107" strokeWidth="1"/>
      <line x1="0"    y1="55%"  x2="20%"  y2="55%"  stroke="#FFC107" strokeWidth="1"/>
      <line x1="20%"  y1="55%"  x2="20%"  y2="70%"  stroke="#FFC107" strokeWidth="1"/>
      <line x1="20%"  y1="70%"  x2="55%"  y2="70%"  stroke="#FFC107" strokeWidth="1"/>
      <line x1="55%"  y1="70%"  x2="55%"  y2="60%"  stroke="#FFC107" strokeWidth="1"/>
      <line x1="55%"  y1="60%"  x2="85%"  y2="60%"  stroke="#FFC107" strokeWidth="1"/>
      <line x1="85%"  y1="60%"  x2="85%"  y2="80%"  stroke="#FFC107" strokeWidth="1"/>
      <line x1="85%"  y1="80%"  x2="100%" y2="80%"  stroke="#FFC107" strokeWidth="1"/>
      <line x1="0"    y1="85%"  x2="40%"  y2="85%"  stroke="#FFC107" strokeWidth="1"/>
      <line x1="40%"  y1="85%"  x2="40%"  y2="95%"  stroke="#FFC107" strokeWidth="1"/>
      <line x1="40%"  y1="95%"  x2="100%" y2="95%"  stroke="#FFC107" strokeWidth="1"/>
      <line x1="80%"  y1="0"    x2="80%"  y2="18%"  stroke="#FFC107" strokeWidth="1"/>
      <line x1="45%"  y1="0"    x2="45%"  y2="10%"  stroke="#FFC107" strokeWidth="1"/>
      <line x1="15%"  y1="30%"  x2="15%"  y2="55%"  stroke="#FFC107" strokeWidth="1"/>
      <line x1="70%"  y1="60%"  x2="70%"  y2="80%"  stroke="#FFC107" strokeWidth="1"/>
      {([
        [30,15],[65,30],[65,18],[20,55],[20,70],[55,70],[55,60],[85,60],[85,80],
        [40,85],[40,95],[80,18],[45,10],[15,55],[70,60],[70,80],
      ] as [number,number][]).map(([cx,cy],i) => (
        <circle key={i} cx={`${cx}%`} cy={`${cy}%`} r="3" fill="#FFC107"/>
      ))}
      <rect x="28%" y="12%" width="6%" height="3%" rx="1" fill="none" stroke="#FFC107" strokeWidth="0.8"/>
      <rect x="63%" y="27%" width="5%" height="3%" rx="1" fill="none" stroke="#FFC107" strokeWidth="0.8"/>
      <rect x="53%" y="57%" width="5%" height="3%" rx="1" fill="none" stroke="#FFC107" strokeWidth="0.8"/>
    </svg>
  )
}

const STEPS = [
  { p: 15, text: 'ตรวจสอบ Session...' },
  { p: 40, text: 'กำลังโหลดข้อมูลผู้ใช้...' },
  { p: 65, text: 'กำลังโหลดข้อมูลสาขา...' },
  { p: 85, text: 'กำลังโหลด Dashboard...' },
  { p: 100, text: 'พร้อมใช้งาน!' },
]

function delay(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

export default function SplashPage() {
  const router  = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [ready,    setReady]    = useState(false)
  const [sweep,    setSweep]    = useState(false)
  const [progress, setProgress] = useState(0)
  const [loadText, setLoadText] = useState('กำลังเตรียมระบบ...')

  useEffect(() => {
    const t1 = setTimeout(() => setReady(true), 50)
    const t2 = setTimeout(() => {
      setSweep(true)
      setTimeout(() => setSweep(false), 650)
    }, 450)

    const t3 = setTimeout(async () => {
      setProgress(STEPS[0].p); setLoadText(STEPS[0].text)
      await delay(180)
      setProgress(STEPS[1].p); setLoadText(STEPS[1].text)

      try {
        const res = await api.get('/auth/me')
        const { permissions = [], enabledModules = [], ...userData } = res.data

        if (userData?.id) {
          setAuth(userData, permissions, enabledModules)
          setProgress(STEPS[2].p); setLoadText(STEPS[2].text); await delay(130)
          setProgress(STEPS[3].p); setLoadText(STEPS[3].text); await delay(130)
          setProgress(STEPS[4].p)
          setLoadText('ยินดีต้อนรับ, ' + (userData.name?.split(' ')[0] ?? 'ผู้ใช้'))
          await delay(280)
          router.replace('/staff/home')
        } else {
          setProgress(100); setLoadText('พร้อมเข้าสู่ระบบ')
          await delay(320); router.replace('/staff/login')
        }
      } catch {
        setProgress(100); setLoadText('พร้อมเข้าสู่ระบบ')
        await delay(320); router.replace('/staff/login')
      }
    }, 700)

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [router, setAuth])

  return (
    <div
      className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden select-none"
      style={{ backgroundColor: '#111111' }}
    >
      {/* Circuit background */}
      <CircuitBg />

      {/* Center glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 65% 50% at 50% 46%, rgba(255,193,7,0.08) 0%, transparent 70%)' }}
      />

      {/* ── Logo box ── */}
      <div className={`relative z-10 transition-all duration-[350ms] ${ready ? 'splash-logo' : 'opacity-0 scale-50'}`}>
        <div
          className="splash-glow relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-[24px]"
          style={{ background: 'linear-gradient(145deg, #FF8C00 0%, #FFC107 100%)' }}
        >
          {/* Lightning bolt */}
          <svg viewBox="0 0 48 48" width="52" height="52" fill="none">
            <path d="M30 4L12 26h14L18 44l20-22H24L30 4z" fill="white"/>
          </svg>

          {/* Sweep light */}
          {sweep && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: 'linear-gradient(105deg, transparent 25%, rgba(255,255,255,0.65) 50%, transparent 75%)',
                animation: 'splashSweepOver 0.55s ease-out forwards',
              }}
            />
          )}
        </div>

        {/* Bottom glow */}
        <div
          className="pointer-events-none absolute -bottom-3 left-1/2 h-4 w-20 -translate-x-1/2 blur-xl"
          style={{ background: 'rgba(255,193,7,0.5)' }}
        />
      </div>

      {/* ── App name: Fix⚡T Pro ── */}
      <div className="splash-text relative z-10 mt-8 flex items-end justify-center">
        <span className="text-[40px] font-black leading-none tracking-tight" style={{ color: '#FFC107' }}>Fix</span>
        {/* I replaced with inline lightning bolt */}
        <svg viewBox="0 0 16 26" width="13" height="21" className="mb-[4px] mx-[2px]">
          <path d="M12 1L3 14h7L4 25 15 12H8L12 1z" fill="#FF8C00"/>
        </svg>
        <span className="text-[40px] font-black leading-none tracking-tight text-white">T</span>
        <span className="text-[40px] font-black leading-none tracking-tight ml-[3px]" style={{ color: '#FFC107' }}>Pro</span>
      </div>

      {/* ── Tagline ── */}
      <p className="splash-sub relative z-10 mt-3 text-[13px] font-medium text-white/55">
        ระบบจัดการร้านมือถือครบวงจร
      </p>

      {/* ── Bullet pills ── */}
      <div className="splash-pills relative z-10 mt-2.5 flex items-center gap-1.5">
        {['ขาย','ซ่อม','สต็อก','ลูกค้า'].map((l, i, arr) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-white/40">{l}</span>
            {i < arr.length-1 && <span className="text-[11px] text-white/20">•</span>}
          </span>
        ))}
      </div>
      <p className="relative z-10 mt-1 text-[10px] text-white/22">ในระบบเดียว</p>

      {/* ── Progress bar ── */}
      <div className="splash-bar absolute bottom-14 z-10 w-full px-10">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] text-white/38">{loadText}</span>
          <span className="text-[11px] font-bold tabular-nums" style={{ color: '#FFC107' }}>{progress}%</span>
        </div>
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #FF8C00, #FFC107)' }}
          />
        </div>
      </div>

      {/* ── Version ── */}
      <p className="absolute bottom-5 z-10 text-[9px] tracking-widest text-white/15 uppercase">
        Version 2.0
      </p>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Delete, Fingerprint, Loader2, Lock, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import {
  backFromAway, biometricAvailable, biometricOn, biometricUnlock, isUnlocked, lockApplies,
  lockFreePath, lockNow, markAway, markUnlocked, setBiometricOn,
} from '@/lib/app-lock'

/** Opens the "change PIN" screen of the lock (from the profile page) */
export const CHANGE_PIN_EVENT = 'fx-app-lock:change-pin'

type Mode =
  | { kind: 'off' }
  | { kind: 'checking' }
  | { kind: 'setup'; step: 'new' | 'confirm'; first?: string; currentPin?: string }
  | { kind: 'change-current' }
  | { kind: 'bio-offer' }
  | { kind: 'locked' }
  | { kind: 'forgot' }

const PIN_LEN = 6

function PinPad({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const press = (d: string) => { if (!disabled && value.length < PIN_LEN) onChange(value + d) }
  return (
    <div className="w-full max-w-[18rem]">
      <div className="mb-8 flex justify-center gap-3" aria-label={`ใส่แล้ว ${value.length} จาก ${PIN_LEN} หลัก`}>
        {Array.from({ length: PIN_LEN }).map((_, i) => (
          <span key={i} className={`h-3.5 w-3.5 rounded-full border-2 ${i < value.length ? 'border-white bg-white' : 'border-white/50'}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} disabled={disabled}
            className="h-16 rounded-full bg-white/10 text-2xl font-semibold text-white active:bg-white/25 disabled:opacity-50">{d}</button>
        ))}
        <span />
        <button type="button" onClick={() => press('0')} disabled={disabled}
          className="h-16 rounded-full bg-white/10 text-2xl font-semibold text-white active:bg-white/25 disabled:opacity-50">0</button>
        <button type="button" aria-label="ลบ" onClick={() => onChange(value.slice(0, -1))} disabled={disabled || !value}
          className="flex h-16 items-center justify-center rounded-full text-white active:bg-white/15 disabled:opacity-30">
          <Delete className="h-6 w-6" />
        </button>
      </div>
    </div>
  )
}

/**
 * The staff app's lock screen. Every account sets a PIN on first use; the app then asks for it
 * (or a fingerprint / face) when opened, and again after 5 minutes away.
 */
export function AppLockGate() {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const userId = user?.id ?? null
  const [applies, setApplies] = useState(false)
  const [mode, setMode] = useState<Mode>({ kind: 'off' })
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [bioReady, setBioReady] = useState(false)
  const [password, setPassword] = useState('')
  const bioTried = useRef(false)

  useEffect(() => { lockApplies().then(setApplies) }, [])
  useEffect(() => { biometricAvailable().then(setBioReady) }, [applies])

  const active = applies && !!userId && !lockFreePath(pathname)

  // Signed in on the staff app: a PIN to set, or the lock unless already opened in this run
  useEffect(() => {
    if (!active || !userId) { setMode({ kind: 'off' }); return }
    if (isUnlocked(userId)) { setMode({ kind: 'off' }); return }
    let gone = false
    setMode({ kind: 'checking' })
    api.get('/auth/app-pin')
      .then(({ data }) => { if (!gone) setMode(data?.hasPin ? { kind: 'locked' } : { kind: 'setup', step: 'new' }) })
      // Cannot reach the server: stay locked (the PIN is checked there)
      .catch(() => { if (!gone) setMode({ kind: 'locked' }) })
    return () => { gone = true }
  }, [active, userId])

  // Away (other app, screen off) for 5 minutes or more: locked again on return
  useEffect(() => {
    if (!active || !userId) return
    const onHide = () => markAway()
    const onShow = () => {
      if (!backFromAway(userId)) { bioTried.current = false; setPin(''); setError(''); setMode({ kind: 'locked' }) }
    }
    const onVis = () => (document.visibilityState === 'hidden' ? onHide() : onShow())
    document.addEventListener('visibilitychange', onVis)
    let remove: (() => void) | undefined
    import('@capacitor/app').then(({ App }) =>
      App.addListener('appStateChange', ({ isActive }) => (isActive ? onShow() : onHide())),
    ).then((h) => { remove = () => h.remove() }).catch(() => {})
    return () => { document.removeEventListener('visibilitychange', onVis); remove?.() }
  }, [active, userId])

  // "เปลี่ยน PIN" in the profile page
  useEffect(() => {
    if (!active) return
    const open = () => { setPin(''); setError(''); setMode({ kind: 'change-current' }) }
    window.addEventListener(CHANGE_PIN_EVENT, open)
    return () => window.removeEventListener(CHANGE_PIN_EVENT, open)
  }, [active])

  const unlock = useCallback(() => {
    if (!userId) return
    markUnlocked(userId)
    setPin(''); setError(''); setPassword('')
    setMode({ kind: 'off' })
  }, [userId])

  const signOut = useCallback(async (message?: string) => {
    lockNow()
    try { await api.post('/auth/logout') } catch { /* already signed out */ }
    clearAuth()
    setMode({ kind: 'off' })
    if (message) toast.error(message)
    router.replace('/staff/login')
  }, [clearAuth, router])

  // Fingerprint / face as soon as the lock shows (once per lock)
  const tryBiometric = useCallback(async () => {
    if (!userId || !bioReady || !biometricOn(userId)) return
    if (await biometricUnlock()) unlock()
  }, [userId, bioReady, unlock])

  useEffect(() => {
    if (mode.kind === 'locked' && !bioTried.current) { bioTried.current = true; tryBiometric() }
    if (mode.kind !== 'locked') bioTried.current = false
  }, [mode.kind, tryBiometric])

  // Six digits entered: act on them
  useEffect(() => {
    if (pin.length !== 6 || busy) return
    const entered = pin
    if (mode.kind === 'locked') {
      setBusy(true)
      api.post('/auth/app-pin/verify', { pin: entered })
        .then(({ data }) => {
          if (data?.ok) return unlock()
          setPin('')
          if (data?.signedOut) return signOut('ใส่ PIN ผิดหลายครั้ง — กรุณาเข้าสู่ระบบใหม่ แล้วตั้ง PIN ใหม่')
          setError(`PIN ไม่ถูกต้อง — เหลืออีก ${data?.triesLeft ?? 0} ครั้ง`)
        })
        .catch((err) => { setPin(''); setError(apiErrorMessage(err)) })
        .finally(() => setBusy(false))
    } else if (mode.kind === 'change-current') {
      setPin(''); setError('')
      setMode({ kind: 'setup', step: 'new', currentPin: entered })
    } else if (mode.kind === 'setup' && mode.step === 'new') {
      setPin(''); setError('')
      setMode({ ...mode, step: 'confirm', first: entered })
    } else if (mode.kind === 'setup' && mode.step === 'confirm') {
      if (entered !== mode.first) {
        setPin(''); setError('PIN ทั้งสองครั้งไม่ตรงกัน — ตั้งใหม่อีกครั้ง')
        setMode({ kind: 'setup', step: 'new', currentPin: mode.currentPin })
        return
      }
      setBusy(true)
      api.post('/auth/app-pin', { pin: entered, ...(mode.currentPin ? { currentPin: mode.currentPin } : {}) })
        .then(() => {
          toast.success('ตั้ง PIN แล้ว')
          setPin(''); setError('')
          if (userId && bioReady && !biometricOn(userId)) setMode({ kind: 'bio-offer' })
          else unlock()
        })
        .catch((err) => {
          setPin(''); setError(apiErrorMessage(err))
          setMode({ kind: 'setup', step: 'new', currentPin: mode.currentPin })
        })
        .finally(() => setBusy(false))
    } else if (mode.kind === 'forgot') {
      if (!password) { setPin(''); setError('กรุณาใส่รหัสผ่านของบัญชีก่อน'); return }
      setBusy(true)
      api.post('/auth/app-pin', { pin: entered, password })
        .then(() => { toast.success('ตั้ง PIN ใหม่แล้ว'); unlock() })
        .catch((err) => { setPin(''); setError(apiErrorMessage(err)) })
        .finally(() => setBusy(false))
    }
  }, [pin, mode, busy, password, userId, bioReady, unlock, signOut])

  if (mode.kind === 'off') return null

  const title =
    mode.kind === 'checking' ? 'FixITPro' :
    mode.kind === 'locked' ? `สวัสดี ${user?.name ?? ''}`.trim() :
    mode.kind === 'change-current' ? 'ใส่ PIN เดิม' :
    mode.kind === 'forgot' ? 'ตั้ง PIN ใหม่' :
    mode.kind === 'bio-offer' ? 'ใช้สแกนนิ้วหรือใบหน้า?' :
    mode.step === 'new' ? (mode.currentPin ? 'ตั้ง PIN ใหม่' : 'ตั้ง PIN 6 หลัก') : 'ใส่ PIN อีกครั้ง'
  const hint =
    mode.kind === 'locked' ? 'ใส่ PIN เพื่อเข้าใช้งาน' :
    mode.kind === 'forgot' ? 'ใส่รหัสผ่านของบัญชี แล้วกด PIN ใหม่ 6 หลัก' :
    mode.kind === 'bio-offer' ? 'ปลดล็อกแอปด้วยลายนิ้วมือหรือใบหน้าที่บันทึกไว้ในมือถือ' :
    mode.kind === 'setup' && mode.step === 'new' && !mode.currentPin ? 'ใช้ทุกครั้งที่เปิดแอป — ห้ามใช้เลขเรียงหรือเลขซ้ำ เช่น 123456, 111111' :
    ''

  return (
    <div role="dialog" aria-modal="true" aria-label="ล็อกแอป"
      className="fixed inset-0 z-[99999999] flex flex-col items-center justify-center bg-slate-900 px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-white">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
        <Lock className="h-7 w-7" />
      </div>
      <p className="text-xl font-bold">{title}</p>
      <p className="mt-1 min-h-[2.5rem] max-w-xs text-center text-sm text-white/70">{hint}</p>
      <p role="alert" className="mb-4 min-h-[1.25rem] text-center text-sm font-semibold text-amber-300">{error}</p>

      {mode.kind === 'checking' && <Loader2 className="h-8 w-8 animate-spin text-white/70" />}

      {mode.kind === 'bio-offer' && (
        <div className="flex w-full max-w-xs flex-col gap-3">
          <button type="button" onClick={async () => {
            if (userId && await biometricUnlock()) { setBiometricOn(userId, true); toast.success('เปิดใช้สแกนนิ้ว/ใบหน้าแล้ว') }
            unlock()
          }} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-white text-base font-bold text-slate-900">
            <Fingerprint className="h-5 w-5" /> ใช้สแกนนิ้ว/ใบหน้า
          </button>
          <button type="button" onClick={unlock} className="h-12 rounded-2xl text-sm font-semibold text-white/80">ไม่ใช้ ใช้ PIN อย่างเดียว</button>
        </div>
      )}

      {mode.kind === 'forgot' && (
        <input type="password" autoComplete="current-password" placeholder="รหัสผ่านของบัญชี" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-6 h-12 w-full max-w-[18rem] rounded-xl bg-white/10 px-4 text-base text-white placeholder:text-white/50 outline-none focus:ring-2 focus:ring-white/40" />
      )}

      {(mode.kind === 'locked' || mode.kind === 'setup' || mode.kind === 'change-current' || mode.kind === 'forgot') && (
        <PinPad value={pin} onChange={(v) => { setError(''); setPin(v) }} disabled={busy} />
      )}

      {mode.kind === 'locked' && (
        <div className="mt-8 flex w-full max-w-[18rem] flex-col items-center gap-2">
          {userId && bioReady && biometricOn(userId) && (
            <button type="button" onClick={tryBiometric} className="flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white">
              <Fingerprint className="h-5 w-5" /> สแกนนิ้ว/ใบหน้า
            </button>
          )}
          <div className="flex w-full justify-between">
            <button type="button" onClick={() => { setPin(''); setError(''); setMode({ kind: 'forgot' }) }}
              className="h-11 px-2 text-sm text-white/70">ลืม PIN</button>
            <button type="button" onClick={() => signOut()} className="flex h-11 items-center gap-1.5 px-2 text-sm text-white/70">
              <LogOut className="h-4 w-4" /> ออกจากระบบ
            </button>
          </div>
        </div>
      )}

      {(mode.kind === 'forgot' || mode.kind === 'change-current' || (mode.kind === 'setup' && mode.currentPin)) && (
        <button type="button" onClick={() => {
          setPin(''); setError(''); setPassword('')
          // Changing a PIN from the profile is already unlocked: cancel goes back to the app
          if (mode.kind === 'forgot') setMode({ kind: 'locked' }); else unlock()
        }} className="mt-6 h-11 px-4 text-sm text-white/70">ยกเลิก</button>
      )}
    </div>
  )
}

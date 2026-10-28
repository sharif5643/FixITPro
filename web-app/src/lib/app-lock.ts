import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Staff app lock (like a bank app): a 6-digit PIN, checked on the server, and fingerprint / face
 * unlock where the phone and the installed app support it. Only the FixITPro Staff app locks;
 * the shared POS (SUNMI) app and browsers do not.
 */

/** Away this long (app in the background) and it locks again */
export const RELOCK_AFTER_MS = 5 * 60 * 1000

/** Turns the lock on in a browser too (testing, or anyone who wants it on a shared computer) */
const FORCE_KEY = 'fx-app-lock'
const BIO_KEY = 'fx-app-lock-bio'
const UNLOCKED_KEY = 'fx-app-unlocked'
const AWAY_KEY = 'fx-app-away-at'

/** Pages open without the lock: signing in, the splash screen, and the forced password change */
const OPEN_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/staff/login', '/staff/register', '/staff/splash', '/staff/change-password']

export function lockFreePath(pathname: string): boolean {
  return OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function store(kind: 'local' | 'session') {
  try { return kind === 'local' ? window.localStorage : window.sessionStorage } catch { return null }
}

/** Is this the FixITPro Staff app (or a browser where the lock was turned on)? */
export async function lockApplies(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (store('local')?.getItem(FORCE_KEY) === 'on') return true
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { App } = await import('@capacitor/app')
    return (await App.getInfo()).id.endsWith('.staff')
  } catch {
    return false
  }
}

// ── Unlocked in this run of the app (cleared when the app is closed) ────────────

export function markUnlocked(userId: string) {
  store('session')?.setItem(UNLOCKED_KEY, userId)
  store('session')?.removeItem(AWAY_KEY)
}

export function isUnlocked(userId: string): boolean {
  const s = store('session')
  if (s?.getItem(UNLOCKED_KEY) !== userId) return false
  const away = Number(s?.getItem(AWAY_KEY) ?? 0)
  return !away || Date.now() - away < RELOCK_AFTER_MS
}

export function markAway() {
  const s = store('session')
  if (s && !s.getItem(AWAY_KEY)) s.setItem(AWAY_KEY, String(Date.now()))
}

/** Back in the app: locks if it was away too long */
export function backFromAway(userId: string): boolean {
  const unlocked = isUnlocked(userId)
  if (unlocked) store('session')?.removeItem(AWAY_KEY)
  else store('session')?.removeItem(UNLOCKED_KEY)
  return unlocked
}

export function lockNow() {
  store('session')?.removeItem(UNLOCKED_KEY)
}

// ── Fingerprint / face (the phone remembers the choice per account) ─────────────

interface AppBiometricPlugin {
  isAvailable(): Promise<{ available: boolean; enrolled?: boolean }>
  authenticate(o: { title?: string; subtitle?: string; cancel?: string }): Promise<{ success: boolean; cancelled?: boolean; error?: string }>
}

const AppBiometric = registerPlugin<AppBiometricPlugin>('AppBiometric')

/** The phone can do it and the installed app has it (apps built before this ask for the PIN only) */
export async function biometricAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('AppBiometric')) return false
  try { return (await AppBiometric.isAvailable()).available } catch { return false }
}

export async function biometricUnlock(): Promise<boolean> {
  try {
    return (await AppBiometric.authenticate({ title: 'ปลดล็อก FixITPro', subtitle: 'สแกนนิ้วหรือใบหน้า', cancel: 'ใช้ PIN' })).success
  } catch {
    return false
  }
}

export function biometricOn(userId: string): boolean {
  return store('local')?.getItem(BIO_KEY) === userId
}

export function setBiometricOn(userId: string, on: boolean) {
  if (on) store('local')?.setItem(BIO_KEY, userId)
  else store('local')?.removeItem(BIO_KEY)
}

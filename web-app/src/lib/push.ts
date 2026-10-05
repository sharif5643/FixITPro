import { Capacitor } from '@capacitor/core'
import api from '@/lib/api'
import { PUSH_TOKEN_KEY, storedPushToken } from '@/lib/push-token'

/**
 * Lock-screen notifications (Firebase) in the Android apps. Only builds made with a Firebase
 * config add this marker to their user agent (see capacitor.config.ts); other builds, and
 * browsers, skip all of this.
 */
export const PUSH_UA_MARK = 'FixITProPush'

export function canPush(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform() && navigator.userAgent.includes(PUSH_UA_MARK)
}

export interface PushOpenData { type?: string; entityType?: string; entityId?: string }

let started = false
let appKind = 'pos'

/**
 * Ask permission once, register this phone for the signed-in account, handle taps. Called again
 * when someone else signs in on the same phone: the phone then moves to that account.
 */
export async function initPush(onOpen: (data: PushOpenData) => void): Promise<void> {
  if (!canPush()) return
  if (started) {
    const token = storedPushToken()
    if (token) api.post('/push/devices', { token, app: appKind, platform: 'android' }).catch(() => {})
    return
  }
  started = true
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const { App } = await import('@capacitor/app')
    const appId = (await App.getInfo().catch(() => null))?.id ?? ''
    const app = appId.endsWith('.staff') ? 'staff' : appId.endsWith('.dev') ? 'dev' : 'pos'
    appKind = app

    // High-importance channel so job alerts make a sound and show on the lock screen
    await PushNotifications.createChannel({
      id: 'jobs', name: 'งานซ่อม', description: 'งานซ่อมใหม่และงานที่มอบหมายให้คุณ',
      importance: 5, visibility: 1, sound: 'default', vibration: true,
    }).catch(() => {})

    let perm = await PushNotifications.checkPermissions()
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') { started = false; return }

    await PushNotifications.removeAllListeners()
    await PushNotifications.addListener('registration', ({ value }) => {
      try { localStorage.setItem(PUSH_TOKEN_KEY, value) } catch { /* private mode */ }
      api.post('/push/devices', { token: value, app, platform: 'android' }).catch(() => {})
    })
    await PushNotifications.addListener('registrationError', () => { started = false })
    await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      onOpen((notification.data ?? {}) as PushOpenData)
    })
    await PushNotifications.register()
  } catch {
    started = false
  }
}

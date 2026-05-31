import { Capacitor } from '@capacitor/core'

// Safe wrapper — returns false during SSR when window is undefined
const isClient = typeof window !== 'undefined'

export const Platform = {
  /** True when running inside a Capacitor native wrapper (Android APK) */
  isNative: (): boolean => isClient && Capacitor.isNativePlatform(),

  /** Current platform string: 'android' | 'ios' | 'web' */
  get: (): string => (isClient ? Capacitor.getPlatform() : 'web'),

  isAndroid: (): boolean => Platform.get() === 'android',
  isWeb: (): boolean => Platform.get() === 'web',

  /**
   * True when NEXT_PUBLIC_APP_MODE=sunmi is set at build/dev time.
   * Useful for testing the SUNMI shell in a desktop browser without APK.
   */
  isSunmiMode: (): boolean =>
    process.env.NEXT_PUBLIC_APP_MODE === 'sunmi',

  /**
   * True when running on a SUNMI POS device.
   * SUNMI devices identify themselves in the Android user-agent.
   * We also check for a SUNMI-specific global set by the native plugin.
   */
  isSunmi: (): boolean => {
    if (!Platform.isAndroid()) return false
    const ua = isClient ? navigator.userAgent.toUpperCase() : ''
    return (
      ua.includes('SUNMI') ||
      !!(isClient && (window as any).__SUNMI_DEVICE__)
    )
  },

  /** True when the app is running in the SUNMI shell — native device or explicit env override */
  isSunmiShell: (): boolean => Platform.isNative() || Platform.isSunmiMode(),
}

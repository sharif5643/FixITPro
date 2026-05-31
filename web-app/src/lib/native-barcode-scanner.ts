import { registerPlugin } from '@capacitor/core'
import { Platform } from './platform'

interface BarcodeScannerPlugin {
  scan(): Promise<{ value: string; cancelled: boolean }>
}

const _Plugin = registerPlugin<BarcodeScannerPlugin>('BarcodeScanner')

/**
 * Opens the native ZXing barcode scanner on Android.
 * Returns the scanned value, or null if cancelled or unavailable.
 * No-op on web (returns null immediately).
 */
export async function nativeScan(): Promise<string | null> {
  if (!Platform.isNative()) return null
  try {
    const result = await _Plugin.scan()
    if (result.cancelled || !result.value) return null
    return result.value
  } catch {
    return null
  }
}

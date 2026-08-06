import type { PrintReceiptOptions, PrintRepairIntakeOptions } from './printer'

// Detect when running inside FixITPro React Native WebView APK
export function isInWebViewApp(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as any).__FIXITPRO_NATIVE__
}

// Printer name injected by native at page load (empty string = none selected yet)
export function getWebViewPrinterName(): string {
  if (typeof window === 'undefined') return ''
  return (window as any).__FIXITPRO_PRINTER__ ?? ''
}

function postToNative(data: object): void {
  ;(window as any).ReactNativeWebView?.postMessage(JSON.stringify(data))
}

export function bridgePrintReceipt(opts: PrintReceiptOptions): void {
  postToNative({ type: 'PRINT_RECEIPT', opts })
}

export function bridgePrintRepairIntake(opts: PrintRepairIntakeOptions): void {
  postToNative({ type: 'PRINT_RECEIPT', opts })
}

export function bridgeSelectPrinter(): void {
  postToNative({ type: 'SELECT_PRINTER' })
}

// Listen for printer connected event from native
export function onWebViewPrinterChange(cb: (name: string) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (e: Event) => cb((e as CustomEvent).detail?.name ?? '')
  window.addEventListener('fixitpro-printer', handler)
  return () => window.removeEventListener('fixitpro-printer', handler)
}

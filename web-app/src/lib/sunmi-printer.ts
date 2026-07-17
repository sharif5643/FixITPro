import { registerPlugin } from '@capacitor/core'

// ── Shared receipt item type ──────────────────────────────────────────────────

export interface PrintItem {
  name:  string
  qty:   number
  price: number
  total: number
}

export interface PrintReceiptOptions {
  shopName:      string
  shopAddress?:  string
  shopPhone?:    string
  receiptNumber: string
  date:          string
  cashierName:   string
  items:         PrintItem[]
  subtotal:      number
  discount:      number
  total:         number
  paymentMethod: string
  amountPaid:    number
  change:        number
  footer?:       string
  customerName?: string
  taxId?:        string
  showTaxId?:    boolean
  paymentQrUrl?: string
  showLogo?:     boolean
  logoUrl?:      string
}

// ── Printer info (returned by getAvailablePrinters) ───────────────────────────

export interface PrinterInfo {
  id:        string   // "inner"  |  "bt:AA:BB:CC:DD:EE:FF"
  name:      string
  type:      'inner' | 'bluetooth'
  available: boolean
  address?:  string
}

// ── Plugin interface ──────────────────────────────────────────────────────────

export type PermissionState = 'granted' | 'denied' | 'prompt'

export interface SunmiPrinterPlugin {
  /** Lists InnerPrinter + paired Bluetooth devices */
  getAvailablePrinters(): Promise<{
    printers:         PrinterInfo[]
    permissionDenied?: boolean    // true when BLUETOOTH_CONNECT was not granted (Android 12+)
    bluetoothDisabled?: boolean   // true when Bluetooth adapter is off
    error?:           string
  }>

  /** Reads saved default printer from device SharedPreferences */
  getDefaultPrinter(): Promise<{ printerId: string; printerName: string }>

  /** Saves default printer to device SharedPreferences */
  setDefaultPrinter(options: { printerId: string; printerName: string }): Promise<{ success: boolean }>

  /** Device model and whether SUNMI InnerPrinter AIDL is bound */
  getDeviceInfo(): Promise<{ isSunmi: boolean; model: string }>

  /**
   * Printer status:
   * - innerBound: SUNMI AIDL connected
   * - bluetoothConnected: active BT socket
   * - Legacy: bound / status / statusText for backward compat
   */
  getStatus(): Promise<{
    innerBound: boolean
    bluetoothConnected: boolean
    connectedAddress: string
    bound: boolean
    status: number
    statusText: string
  }>

  /**
   * PRIMARY PRINT METHOD
   * Renders HTML → 384px Bitmap → ESC/POS raster → sends to selected printer.
   * printerId: "inner" for SUNMI InnerPrinter, "bt:MAC" for Bluetooth.
   */
  printHtml(options: {
    html:       string
    printerId:  string
    jobName?:   string
  }): Promise<{
    success:        boolean
    error?:         string
    // Debug fields returned by the Kotlin plugin for diagnosis
    dbg_density?:   number
    dbg_renderW?:   number
    dbg_cssH?:      number
    dbg_viewScale?: number
    dbg_contentH?:  number
    dbg_rawW?:      number
    dbg_rawH?:      number
    dbg_scaledW?:   number
    dbg_scaledH?:   number
    dbg_bpr?:       number
    dbg_bytes?:     number
  }>

  /**
   * Prints a test page to the specified printer.
   */
  printTest(options: { printerId: string }): Promise<{ success: boolean; error?: string }>

  /** Opens Android Bluetooth Settings so the user can pair a new printer */
  openBluetoothSettings(): Promise<{ success: boolean; error?: string }>

  /** Check current Bluetooth permission state (Capacitor permissions API) */
  checkPermissions(): Promise<{ bluetoothConnect: PermissionState; bluetoothScan: PermissionState }>

  /** Request Bluetooth runtime permissions on Android 12+ */
  requestPermissions(): Promise<{ bluetoothConnect: PermissionState; bluetoothScan: PermissionState }>

  // Legacy stubs — return success=false
  openCashDrawer(): Promise<{ success: boolean }>
  printReceipt(options: PrintReceiptOptions): Promise<{ success: boolean; error?: string }>
  printLines(options: { lines: { text: string }[] }): Promise<{ success: boolean; error?: string }>
  feedPaper(options: { lines: number }): Promise<{ success: boolean }>
  cutPaper(): Promise<{ success: boolean }>
}

// ── Register with Capacitor ───────────────────────────────────────────────────

export const SunmiPrinter = registerPlugin<SunmiPrinterPlugin>('SunmiPrinter', {
  web: {
    getAvailablePrinters: async () => ({ printers: [] }),
    getDefaultPrinter:    async () => ({ printerId: '', printerName: '' }),
    setDefaultPrinter:    async () => ({ success: false }),
    getDeviceInfo:        async () => ({ isSunmi: false, model: 'Web Browser' }),
    getStatus:            async () => ({
      innerBound: false, bluetoothConnected: false, connectedAddress: '',
      bound: false, status: -1, statusText: 'ไม่ได้เชื่อมต่อเครื่องพิมพ์',
    }),
    printHtml:     async () => ({ success: false, error: 'Not native' }),
    printTest:     async () => ({ success: false, error: 'Not native' }),
    openBluetoothSettings: async () => ({ success: false, error: 'Not native' }),
    checkPermissions:  async () => ({ bluetoothConnect: 'granted' as PermissionState, bluetoothScan: 'granted' as PermissionState }),
    requestPermissions: async () => ({ bluetoothConnect: 'granted' as PermissionState, bluetoothScan: 'granted' as PermissionState }),
    openCashDrawer: async () => ({ success: false }),
    printReceipt:   async () => ({ success: false, error: 'Use printHtml' }),
    printLines:     async () => ({ success: false, error: 'Use printHtml' }),
    feedPaper:      async () => ({ success: false }),
    cutPaper:       async () => ({ success: false }),
  },
})

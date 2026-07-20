// ESC/POS cash drawer pulse: ESC p pin t1 t2
// Pin 2 (RJ11 pin 2 — standard for most drawers): 0x1B 0x70 0x00 0x19 0xFA
// Pin 5 (RJ11 pin 5 — alternate): change 0x00 → 0x01
const DRAWER_PULSE = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA])

// Minimal Web Serial API types (spec not yet in TypeScript stdlib)
interface SerialPort {
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  readonly writable: WritableStream<Uint8Array>
}
interface SerialApi {
  getPorts(): Promise<SerialPort[]>
  requestPort(options?: object): Promise<SerialPort>
}

function getSerialApi(): SerialApi | null {
  if (typeof navigator === 'undefined') return null
  return (navigator as unknown as { serial?: SerialApi }).serial ?? null
}

export function isCashDrawerSupported(): boolean {
  return getSerialApi() !== null
}

export interface CashDrawerStatus {
  supported: boolean
  authorized: boolean
  portCount: number
}

/** Check current Web Serial authorization state — no user prompt, no port open. */
export async function getCashDrawerStatus(): Promise<CashDrawerStatus> {
  const serial = getSerialApi()
  if (!serial) return { supported: false, authorized: false, portCount: 0 }

  try {
    const ports = await serial.getPorts()
    return { supported: true, authorized: ports.length > 0, portCount: ports.length }
  } catch {
    return { supported: true, authorized: false, portCount: 0 }
  }
}

/**
 * Opens the cash drawer by sending an ESC/POS pulse on the already-authorized port.
 *
 * NEVER calls `requestPort()` — this function is safe to call during checkout because
 * it will silently skip if no port has been pre-authorized via Settings > Hardware.
 *
 * Errors are swallowed — a drawer failure must never interrupt the sale.
 */
export async function openCashDrawer(): Promise<void> {
  const serial = getSerialApi()
  if (!serial) {
    console.warn('[CashDrawer] Web Serial API not available (requires Chrome/Edge on HTTPS)')
    return
  }
  try {
    const ports = await serial.getPorts()
    if (ports.length === 0) {
      console.warn('[CashDrawer] No authorized port — connect via Settings > Hardware > Cash Drawer')
      return
    }
    const port = ports[0]
    await port.open({ baudRate: 9600 })
    const writer = port.writable.getWriter()
    try {
      await writer.write(DRAWER_PULSE)
    } finally {
      writer.releaseLock()
    }
    await port.close()
    console.log('[CashDrawer] Pulse sent (ESC p 0 0x19 0xFA)')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[CashDrawer] Failed to open drawer:', msg)
    // Non-fatal — sale and receipt are unaffected
  }
}

/**
 * Requests a new serial port authorization from the user via the browser picker.
 *
 * Must ONLY be called from Settings > Hardware — never during checkout.
 * Requires a direct user gesture (button click) to satisfy browser security requirements.
 *
 * Returns true if the user selected a port, false if they cancelled.
 */
export async function connectCashDrawer(): Promise<boolean> {
  const serial = getSerialApi()
  if (!serial) return false
  try {
    await serial.requestPort()
    return true
  } catch {
    // User cancelled the picker or permission denied — not an error
    return false
  }
}

/**
 * Test pulse for the Settings page — identical to openCashDrawer() but intended
 * for explicit user-triggered testing.  Uses only pre-authorized ports.
 */
export async function testCashDrawer(): Promise<{ success: boolean; message: string }> {
  const serial = getSerialApi()
  if (!serial) {
    return { success: false, message: 'Web Serial API ไม่รองรับ (ต้องใช้ Chrome/Edge บน HTTPS)' }
  }
  try {
    const ports = await serial.getPorts()
    if (ports.length === 0) {
      return { success: false, message: 'ยังไม่ได้เชื่อมต่อ กดปุ่ม "เชื่อมต่อลิ้นชัก" ก่อน' }
    }
    const port = ports[0]
    await port.open({ baudRate: 9600 })
    const writer = port.writable.getWriter()
    try {
      await writer.write(DRAWER_PULSE)
    } finally {
      writer.releaseLock()
    }
    await port.close()
    return { success: true, message: 'ส่งสัญญาณเปิดลิ้นชักสำเร็จ' }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, message: `เกิดข้อผิดพลาด: ${msg}` }
  }
}

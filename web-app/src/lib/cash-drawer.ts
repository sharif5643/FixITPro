// ESC/POS cash drawer pulse: ESC p pin t1 t2
// Pin 2 (RJ11 pin 2 — standard for most drawers): 0x1B 0x70 0x00 0x19 0xFA
const DRAWER_PULSE = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA])

const AGENT_URL = 'https://localhost:7777'
const STORAGE_KEY = 'fixitpro_drawer_config'

// ── Config types ──────────────────────────────────────────────────────────────

export type DrawerMethod = 'serial' | 'network' | 'windows' | 'com'

export interface DrawerConfig {
  method: DrawerMethod
  // network
  ip?: string
  port?: number
  // windows USB
  printer?: string
  // COM port (Bluetooth / virtual serial)
  comPort?: string
  baudRate?: number
}

export function saveDrawerConfig(config: DrawerConfig): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)) } catch {}
}

export function loadDrawerConfig(): DrawerConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function clearDrawerConfig(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
}

// ── Web Serial API types ───────────────────────────────────────────────────────

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

// ── Status ────────────────────────────────────────────────────────────────────

export interface CashDrawerStatus {
  supported: boolean
  authorized: boolean
  portCount: number
  agentAvailable?: boolean
  config?: DrawerConfig | null
}

export async function getCashDrawerStatus(): Promise<CashDrawerStatus> {
  const serial = getSerialApi()
  const config = loadDrawerConfig()

  let agentAvailable = false
  if (config && config.method !== 'serial') {
    agentAvailable = await checkAgent()
  }

  if (!serial) return { supported: false, authorized: false, portCount: 0, agentAvailable, config }

  try {
    const ports = await serial.getPorts()
    return { supported: true, authorized: ports.length > 0, portCount: ports.length, agentAvailable, config }
  } catch {
    return { supported: true, authorized: false, portCount: 0, agentAvailable, config }
  }
}

// ── Agent helpers ─────────────────────────────────────────────────────────────

async function checkAgent(): Promise<boolean> {
  try {
    const r = await fetch(`${AGENT_URL}/health`, { signal: AbortSignal.timeout(2000) })
    return r.ok
  } catch { return false }
}

async function openDrawerViaAgent(config: DrawerConfig): Promise<void> {
  const body: Record<string, unknown> = { method: config.method }
  if (config.method === 'network') { body.ip = config.ip; body.port = config.port ?? 9100 }
  if (config.method === 'windows') { body.printer = config.printer }
  if (config.method === 'com')     { body.method = 'serial'; body.comPort = config.comPort; body.baudRate = config.baudRate ?? 9600 }

  const r = await fetch(`${AGENT_URL}/open-drawer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(err.error ?? r.statusText)
  }
}

// ── Web Serial open ───────────────────────────────────────────────────────────

async function openDrawerViaSerial(): Promise<void> {
  const serial = getSerialApi()
  if (!serial) throw new Error('Web Serial API ไม่รองรับ (ต้องใช้ Chrome/Edge บน HTTPS)')

  const ports = await serial.getPorts()
  if (ports.length === 0) throw new Error('ยังไม่ได้เชื่อมต่อ — ไปที่ Settings > ฮาร์ดแวร์ เพื่อเชื่อมต่อก่อน')

  const port = ports[0]
  await port.open({ baudRate: 9600 })
  const writer = port.writable.getWriter()
  try {
    await writer.write(DRAWER_PULSE)
  } finally {
    writer.releaseLock()
  }
  await port.close()
}

// ── Main export: open drawer ──────────────────────────────────────────────────

/**
 * Open cash drawer using saved config.
 * - 'serial'  → Web Serial API (Bluetooth COM, USB virtual COM via browser)
 * - 'network' → raw TCP via FixITPro Agent (WiFi/LAN printer)
 * - 'windows' → Win32 API via FixITPro Agent (USB Windows printer)
 * - 'com'     → SerialPort via FixITPro Agent (Bluetooth/USB COM from Windows side)
 *
 * Non-fatal: errors are logged but never interrupt the sale.
 */
export async function openCashDrawer(): Promise<void> {
  const config = loadDrawerConfig()
  if (!config) {
    console.warn('[CashDrawer] No config — set up in Settings > ฮาร์ดแวร์')
    return
  }

  try {
    if (config.method === 'serial') {
      await openDrawerViaSerial()
    } else {
      await openDrawerViaAgent(config)
    }
    console.log(`[CashDrawer] Opened via ${config.method}`)
  } catch (err: unknown) {
    console.error('[CashDrawer] Failed:', err instanceof Error ? err.message : String(err))
  }
}

// ── Settings helpers ───────────────────────────────────────────────────────────

/** Request Web Serial port (must be called from a user gesture) */
export async function connectCashDrawer(): Promise<boolean> {
  const serial = getSerialApi()
  if (!serial) return false
  try {
    await serial.requestPort()
    return true
  } catch { return false }
}

/** Fetch printer list from agent */
export async function fetchAgentPrinters(): Promise<{ printers: string[]; comPorts: string[] }> {
  const r = await fetch(`${AGENT_URL}/printers`, { signal: AbortSignal.timeout(3000) })
  return r.json()
}

/** Test current saved config */
export async function testCashDrawer(): Promise<{ success: boolean; message: string }> {
  const config = loadDrawerConfig()
  if (!config) return { success: false, message: 'ยังไม่ได้ตั้งค่าลิ้นชัก — เลือกวิธีเชื่อมต่อก่อน' }

  try {
    if (config.method === 'serial') {
      await openDrawerViaSerial()
    } else {
      await openDrawerViaAgent(config)
    }
    return { success: true, message: 'ส่งสัญญาณเปิดลิ้นชักสำเร็จ' }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, message: `เกิดข้อผิดพลาด: ${msg}` }
  }
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Printer, Camera, Wifi, HardDrive, RefreshCw,
  CheckCircle2, XCircle, AlertCircle, Loader2, Plug,
  Download, Radio, Network, Usb,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getCashDrawerStatus,
  connectCashDrawer,
  testCashDrawer,
  saveDrawerConfig,
  loadDrawerConfig,
  clearDrawerConfig,
  fetchAgentPrinters,
  type CashDrawerStatus,
  type DrawerMethod,
  type DrawerConfig,
} from '@/lib/cash-drawer'

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckStatus = 'idle' | 'checking' | 'ok' | 'warn' | 'fail'

interface HardwareCheck {
  key: string
  label: string
  description: string
  icon: React.ElementType
  status: CheckStatus
  detail?: string
}

function StatusBadge({ status }: { status: CheckStatus }) {
  if (status === 'checking') return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  if (status === 'ok')   return <CheckCircle2 className="h-5 w-5 text-green-500" />
  if (status === 'warn') return <AlertCircle  className="h-5 w-5 text-yellow-500" />
  if (status === 'fail') return <XCircle      className="h-5 w-5 text-red-500" />
  return <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
}

// ── Method option card ────────────────────────────────────────────────────────

const METHOD_OPTIONS: { value: DrawerMethod; label: string; desc: string; icon: React.ElementType }[] = [
  { value: 'serial',  label: 'Bluetooth / COM (ไม่ต้องติดตั้ง)', desc: 'เชื่อม Bluetooth แล้วเลือก COM port ในเบราว์เซอร์ — ใช้ได้เลยไม่ต้องโหลดอะไร', icon: Radio },
  { value: 'network', label: 'Network / WiFi (ผ่าน Agent)', desc: 'ปริ้นเตอร์เชื่อม WiFi/LAN — ระบุ IP ที่อยู่', icon: Network },
  { value: 'windows', label: 'USB Windows Printer (ผ่าน Agent)', desc: 'ปริ้นเตอร์เชื่อม USB — เลือกชื่อปริ้นเตอร์จาก Windows', icon: Usb },
  { value: 'com',     label: 'COM Port (ผ่าน Agent)', desc: 'Bluetooth / USB virtual COM — ให้ Agent จัดการ (ไม่ต้องใช้ Chrome)', icon: Plug },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HardwarePage() {
  const [checks, setChecks] = useState<HardwareCheck[]>([
    { key: 'network', label: 'เครือข่าย', description: 'ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต', icon: Wifi, status: 'idle' },
    { key: 'printer', label: 'เครื่องพิมพ์ SUNMI', description: 'ตรวจสอบ SUNMI InnerPrinter API', icon: Printer, status: 'idle' },
    { key: 'camera',  label: 'กล้อง / สแกนบาร์โค้ด', description: 'ตรวจสอบสิทธิ์เข้าถึงกล้อง', icon: Camera, status: 'idle' },
    { key: 'storage', label: 'IndexedDB (Offline)', description: 'ตรวจสอบที่เก็บข้อมูลในเครื่อง', icon: HardDrive, status: 'idle' },
  ])
  const [running, setRunning] = useState(false)

  // ── Drawer state ──────────────────────────────────────────────────────────
  const [drawerStatus,     setDrawerStatus]     = useState<CashDrawerStatus | null>(null)
  const [drawerTesting,    setDrawerTesting]     = useState(false)
  const [drawerConnecting, setDrawerConnecting]  = useState(false)
  const [drawerTestResult, setDrawerTestResult]  = useState<{ success: boolean; message: string } | null>(null)

  // ── Method selection ──────────────────────────────────────────────────────
  const [selectedMethod, setSelectedMethod] = useState<DrawerMethod>('serial')
  const [networkIp,      setNetworkIp]      = useState('192.168.1.100')
  const [networkPort,    setNetworkPort]    = useState('9100')
  const [winPrinter,     setWinPrinter]    = useState('')
  const [comPort,        setComPort]        = useState('COM3')
  const [printerList,    setPrinterList]    = useState<string[]>([])
  const [comList,        setComList]        = useState<string[]>([])
  const [agentOnline,    setAgentOnline]    = useState<boolean | null>(null)
  const [fetchingPrinters, setFetchingPrinters] = useState(false)

  const setCheck = useCallback((key: string, status: CheckStatus, detail?: string) => {
    setChecks((prev) => prev.map((c) => (c.key === key ? { ...c, status, detail } : c)))
  }, [])

  // Load saved config
  useEffect(() => {
    const cfg = loadDrawerConfig()
    if (cfg) {
      setSelectedMethod(cfg.method)
      if (cfg.ip)      setNetworkIp(cfg.ip)
      if (cfg.port)    setNetworkPort(String(cfg.port))
      if (cfg.printer) setWinPrinter(cfg.printer)
      if (cfg.comPort) setComPort(cfg.comPort)
    }
    getCashDrawerStatus().then(setDrawerStatus)
  }, [])

  const runChecks = useCallback(async () => {
    setRunning(true)
    setChecks((prev) => prev.map((c) => ({ ...c, status: 'checking' as CheckStatus, detail: undefined })))

    await new Promise((r) => setTimeout(r, 200))
    setCheck('network', navigator.onLine ? 'ok' : 'fail', navigator.onLine ? 'ออนไลน์' : 'ไม่มีการเชื่อมต่ออินเทอร์เน็ต')

    await new Promise((r) => setTimeout(r, 100))
    try {
      const w = window as any
      if (w.SunmiInnerPrinter || w.sunmi) {
        setCheck('printer', 'ok', 'พบ SUNMI InnerPrinter API')
      } else if (/Android/i.test(navigator.userAgent)) {
        setCheck('printer', 'warn', 'Android แต่ไม่พบ SUNMI API')
      } else {
        setCheck('printer', 'warn', 'ไม่พบ SUNMI API — ใช้ได้เฉพาะบนอุปกรณ์ SUNMI')
      }
    } catch { setCheck('printer', 'fail', 'เกิดข้อผิดพลาด') }

    await new Promise((r) => setTimeout(r, 100))
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCheck('camera', 'fail', 'เบราว์เซอร์ไม่รองรับ getUserMedia')
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        stream.getTracks().forEach((t) => t.stop())
        setCheck('camera', 'ok', 'ได้รับสิทธิ์เข้าถึงกล้อง')
      }
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') setCheck('camera', 'fail', 'ผู้ใช้ปฏิเสธสิทธิ์กล้อง')
      else if (err?.name === 'NotFoundError') setCheck('camera', 'warn', 'ไม่พบกล้องในอุปกรณ์นี้')
      else setCheck('camera', 'warn', err?.message ?? 'ไม่สามารถเข้าถึงกล้องได้')
    }

    await new Promise((r) => setTimeout(r, 100))
    try {
      if (!window.indexedDB) { setCheck('storage', 'fail', 'เบราว์เซอร์ไม่รองรับ IndexedDB') }
      else {
        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.open('__hardware_check__', 1)
          req.onsuccess = () => { req.result.close(); resolve() }
          req.onerror   = () => reject(req.error)
        })
        setCheck('storage', 'ok', 'IndexedDB พร้อมใช้งาน')
      }
    } catch (err: any) { setCheck('storage', 'fail', err?.message ?? 'ไม่สามารถเปิด IndexedDB ได้') }

    setRunning(false)
  }, [setCheck])

  useEffect(() => { runChecks() }, [runChecks])

  const summary = {
    ok:   checks.filter((c) => c.status === 'ok').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
  }
  const allDone = checks.every((c) => c.status !== 'idle' && c.status !== 'checking')

  // ── Save + test ───────────────────────────────────────────────────────────

  function buildConfig(): DrawerConfig {
    if (selectedMethod === 'network') return { method: 'network', ip: networkIp, port: Number(networkPort) || 9100 }
    if (selectedMethod === 'windows') return { method: 'windows', printer: winPrinter }
    if (selectedMethod === 'com')     return { method: 'com', comPort, baudRate: 9600 }
    return { method: 'serial' }
  }

  async function handleLoadPrinters() {
    setFetchingPrinters(true)
    try {
      const data = await fetchAgentPrinters()
      setPrinterList(data.printers)
      setComList(data.comPorts)
      setAgentOnline(true)
    } catch {
      setAgentOnline(false)
    } finally { setFetchingPrinters(false) }
  }

  async function handleConnect() {
    setDrawerConnecting(true)
    setDrawerTestResult(null)
    if (selectedMethod === 'serial') {
      const ok = await connectCashDrawer()
      if (ok) {
        saveDrawerConfig({ method: 'serial' })
        setDrawerStatus(await getCashDrawerStatus())
      }
    } else {
      saveDrawerConfig(buildConfig())
      setDrawerStatus(await getCashDrawerStatus())
    }
    setDrawerConnecting(false)
  }

  async function handleTest() {
    setDrawerTesting(true)
    setDrawerTestResult(null)
    saveDrawerConfig(buildConfig())
    const result = await testCashDrawer()
    setDrawerTestResult(result)
    setDrawerTesting(false)
  }

  const needsAgent = selectedMethod !== 'serial'

  return (
    <div className="space-y-6">
      <PageHeader
        title="ตรวจสอบฮาร์ดแวร์"
        subtitle="ตรวจสอบความพร้อมของอุปกรณ์และตั้งค่าลิ้นชักเงินสด"
        primaryAction={
          <Button onClick={runChecks} disabled={running} variant="outline" size="sm">
            {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            ตรวจสอบใหม่
          </Button>
        }
      />

      {allDone && (
        <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium ${
          summary.fail > 0
            ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300'
            : summary.warn > 0
              ? 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-700/60 dark:bg-yellow-900/20 dark:text-yellow-300'
              : 'border-green-200 bg-green-50 text-green-700 dark:border-green-700/60 dark:bg-green-900/20 dark:text-green-300'
        }`}>
          {summary.fail > 0 ? `พบปัญหา ${summary.fail} รายการ` : summary.warn > 0 ? `ผ่าน ${summary.ok} · คำเตือน ${summary.warn}` : `ผ่านทั้งหมด ${summary.ok} รายการ ✓`}
        </div>
      )}

      <SectionCard title="ผลการตรวจสอบ">
        <div className="divide-y">
          {checks.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.key} className="flex items-center gap-3 py-4 px-1">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${
                  item.status === 'ok' ? 'bg-green-50 dark:bg-green-950' :
                  item.status === 'warn' ? 'bg-yellow-50 dark:bg-yellow-950' :
                  item.status === 'fail' ? 'bg-red-50 dark:bg-red-950' : 'bg-muted'
                }`}>
                  <Icon className={`h-5 w-5 ${
                    item.status === 'ok' ? 'text-green-600' :
                    item.status === 'warn' ? 'text-yellow-600' :
                    item.status === 'fail' ? 'text-red-500' : 'text-muted-foreground'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.detail ?? item.description}</p>
                </div>
                <StatusBadge status={item.status} />
              </div>
            )
          })}
        </div>
      </SectionCard>

      {/* ── Cash Drawer ──────────────────────────────────────────────────────── */}
      <SectionCard title="ลิ้นชักเก็บเงิน">

        {/* Method selector */}
        <div className="space-y-3 mb-4">
          <p className="text-sm font-medium">เลือกวิธีเชื่อมต่อ</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {METHOD_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const active = selectedMethod === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => { setSelectedMethod(opt.value); setDrawerTestResult(null) }}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    active
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                      : 'border-border hover:border-muted-foreground/40'
                  }`}
                >
                  <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${active ? 'text-blue-600' : 'text-muted-foreground'}`} />
                  <div>
                    <p className={`text-sm font-medium ${active ? 'text-blue-700 dark:text-blue-300' : ''}`}>{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Config inputs */}
        <div className="space-y-3 mb-4">
          {selectedMethod === 'network' && (
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">IP Address ปริ้นเตอร์</Label>
                <Input value={networkIp} onChange={(e) => setNetworkIp(e.target.value)} placeholder="192.168.1.100" className="h-8 text-sm" />
              </div>
              <div className="w-24 space-y-1">
                <Label className="text-xs">Port</Label>
                <Input value={networkPort} onChange={(e) => setNetworkPort(e.target.value)} placeholder="9100" className="h-8 text-sm" />
              </div>
            </div>
          )}

          {selectedMethod === 'windows' && (
            <div className="space-y-2">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">ชื่อปริ้นเตอร์ใน Windows</Label>
                  {printerList.length > 0 ? (
                    <select
                      value={winPrinter}
                      onChange={(e) => setWinPrinter(e.target.value)}
                      className="w-full h-8 text-sm rounded-md border border-input bg-background px-2"
                    >
                      <option value="">-- เลือกปริ้นเตอร์ --</option>
                      {printerList.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <Input value={winPrinter} onChange={(e) => setWinPrinter(e.target.value)} placeholder="EPSON TM-T82III" className="h-8 text-sm" />
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={handleLoadPrinters} disabled={fetchingPrinters} className="h-8 shrink-0">
                  {fetchingPrinters ? <Loader2 className="h-3 w-3 animate-spin" /> : 'โหลดรายการ'}
                </Button>
              </div>
              {agentOnline === false && (
                <p className="text-xs text-red-600">ไม่พบ FixITPro Agent — ต้องดาวน์โหลดและรันก่อน</p>
              )}
            </div>
          )}

          {selectedMethod === 'com' && (
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">COM Port</Label>
                {comList.length > 0 ? (
                  <select
                    value={comPort}
                    onChange={(e) => setComPort(e.target.value)}
                    className="w-full h-8 text-sm rounded-md border border-input bg-background px-2"
                  >
                    {comList.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <Input value={comPort} onChange={(e) => setComPort(e.target.value)} placeholder="COM3" className="h-8 text-sm" />
                )}
              </div>
              <Button variant="outline" size="sm" onClick={handleLoadPrinters} disabled={fetchingPrinters} className="h-8 shrink-0">
                {fetchingPrinters ? <Loader2 className="h-3 w-3 animate-spin" /> : 'ตรวจ COM'}
              </Button>
            </div>
          )}

          {selectedMethod === 'serial' && (
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
              จับคู่ Bluetooth กับ Windows ก่อน → Windows จะสร้าง COM port อัตโนมัติ → กด "เชื่อมต่อ" แล้วเลือก COM นั้น
            </div>
          )}
        </div>

        {/* Agent download banner */}
        {needsAgent && (
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-950/30 px-3 py-2 mb-4">
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">ต้องติดตั้ง FixITPro Agent ก่อน</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">โปรแกรมเล็กๆ รันเงียบๆ ใน taskbar — ติดตั้งครั้งเดียว</p>
            </div>
            <a
              href="/downloads/FixITPro-Agent.exe"
              download
              className="flex items-center gap-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium px-3 py-1.5 transition-colors shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              ดาวน์โหลด
            </a>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={drawerConnecting || drawerTesting}
            onClick={handleConnect}
          >
            {drawerConnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plug className="h-4 w-4 mr-2" />}
            {selectedMethod === 'serial' ? 'เชื่อมต่อและเลือก Port' : 'บันทึกการตั้งค่า'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={drawerTesting || drawerConnecting}
            onClick={handleTest}
          >
            {drawerTesting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            ทดสอบเปิดลิ้นชัก
          </Button>
          {loadDrawerConfig() && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => { clearDrawerConfig(); setDrawerTestResult(null); getCashDrawerStatus().then(setDrawerStatus) }}
            >
              ยกเลิกการตั้งค่า
            </Button>
          )}
        </div>

        {/* Current config pill */}
        {drawerStatus?.config && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
            <span>
              {drawerStatus.config.method === 'serial'  && 'ตั้งค่าแล้ว: Web Serial (Bluetooth/COM)'}
              {drawerStatus.config.method === 'network' && `ตั้งค่าแล้ว: Network ${drawerStatus.config.ip}:${drawerStatus.config.port ?? 9100}`}
              {drawerStatus.config.method === 'windows' && `ตั้งค่าแล้ว: USB "${drawerStatus.config.printer}"`}
              {drawerStatus.config.method === 'com'     && `ตั้งค่าแล้ว: COM port ${drawerStatus.config.comPort}`}
            </span>
          </div>
        )}

        {/* Test result */}
        {drawerTestResult && (
          <div className={`mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            drawerTestResult.success
              ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-700/60 dark:bg-green-900/20 dark:text-green-300'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300'
          }`}>
            {drawerTestResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
            {drawerTestResult.message}
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          ลิ้นชักจะเปิดอัตโนมัติทุกครั้งที่รับเงินสด — ถ้าไม่ได้ตั้งค่าหรือไม่มีลิ้นชัก ระบบยังทำงานได้ปกติ
        </p>
      </SectionCard>

      <SectionCard title="วิธีแก้ไขปัญหา">
        <div className="space-y-3 text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-foreground mb-1">Bluetooth / COM — ลิ้นชักไม่เด้ง</p>
            <p>ตรวจสอบว่าจับคู่ Bluetooth แล้ว → Windows Device Manager → Ports (COM & LPT) → เลือก COM ของปริ้นเตอร์</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">USB — ไม่พบ Agent</p>
            <p>ดาวน์โหลด FixITPro-Agent.exe และรัน → ดับเบิ้ลคลิก install-autostart.bat เพื่อให้เปิดอัตโนมัติ</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Network — เชื่อมต่อไม่ได้</p>
            <p>ตรวจสอบ IP ปริ้นเตอร์ → พิมพ์หน้า Network Config จากปริ้นเตอร์ → ต้องอยู่ใน network เดียวกัน</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">เครื่องพิมพ์ไม่พบ (SUNMI)</p>
            <p>ตรวจสอบว่าเปิดใช้ SUNMI InnerPrinter ใน Settings → Developer Options หรือติดตั้ง APK จาก FixITPro</p>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

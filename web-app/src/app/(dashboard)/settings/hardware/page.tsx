'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Printer, Camera, Wifi, HardDrive, RefreshCw,
  CheckCircle2, XCircle, AlertCircle, Loader2, Plug,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { Button } from '@/components/ui/button'
import {
  getCashDrawerStatus,
  connectCashDrawer,
  testCashDrawer,
  type CashDrawerStatus,
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

// ── Status icon ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: CheckStatus }) {
  if (status === 'checking') return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  if (status === 'ok')   return <CheckCircle2 className="h-5 w-5 text-green-500" />
  if (status === 'warn') return <AlertCircle  className="h-5 w-5 text-yellow-500" />
  if (status === 'fail') return <XCircle      className="h-5 w-5 text-red-500" />
  return <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HardwarePage() {
  const [checks, setChecks] = useState<HardwareCheck[]>([
    {
      key: 'network',
      label: 'เครือข่าย',
      description: 'ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต',
      icon: Wifi,
      status: 'idle',
    },
    {
      key: 'printer',
      label: 'เครื่องพิมพ์ SUNMI',
      description: 'ตรวจสอบ SUNMI InnerPrinter API',
      icon: Printer,
      status: 'idle',
    },
    {
      key: 'camera',
      label: 'กล้อง / สแกนบาร์โค้ด',
      description: 'ตรวจสอบสิทธิ์เข้าถึงกล้อง',
      icon: Camera,
      status: 'idle',
    },
    {
      key: 'storage',
      label: 'IndexedDB (Offline)',
      description: 'ตรวจสอบที่เก็บข้อมูลในเครื่อง',
      icon: HardDrive,
      status: 'idle',
    },
  ])

  const [running, setRunning] = useState(false)

  // ── Cash Drawer state ─────────────────────────────────────────────────────
  const [drawerStatus,      setDrawerStatus]      = useState<CashDrawerStatus | null>(null)
  const [drawerConnecting,  setDrawerConnecting]  = useState(false)
  const [drawerTesting,     setDrawerTesting]     = useState(false)
  const [drawerTestResult,  setDrawerTestResult]  = useState<{ success: boolean; message: string } | null>(null)

  const setCheck = useCallback((key: string, status: CheckStatus, detail?: string) => {
    setChecks((prev) =>
      prev.map((c) => (c.key === key ? { ...c, status, detail } : c)),
    )
  }, [])

  const runChecks = useCallback(async () => {
    setRunning(true)
    // Reset all to checking
    setChecks((prev) => prev.map((c) => ({ ...c, status: 'checking' as CheckStatus, detail: undefined })))

    // ── Network ──────────────────────────────────────────────────────────────
    await new Promise((r) => setTimeout(r, 200))
    if (navigator.onLine) {
      setCheck('network', 'ok', 'ออนไลน์')
    } else {
      setCheck('network', 'fail', 'ไม่มีการเชื่อมต่ออินเทอร์เน็ต')
    }

    // ── Printer (SUNMI InnerPrinter) ─────────────────────────────────────────
    await new Promise((r) => setTimeout(r, 100))
    try {
      const w = window as any
      if (w.SunmiInnerPrinter || w.sunmi || document.querySelector('sunmi-printer')) {
        setCheck('printer', 'ok', 'พบ SUNMI InnerPrinter API')
      } else if (/Android/i.test(navigator.userAgent)) {
        // On Android but no SUNMI API — likely a non-SUNMI device
        setCheck('printer', 'warn', 'Android แต่ไม่พบ SUNMI API — ตรวจสอบว่าเปิดใช้งาน InnerPrinter แล้ว')
      } else {
        setCheck('printer', 'warn', 'ไม่พบ SUNMI API — ใช้ได้เฉพาะบนอุปกรณ์ SUNMI หรือ APK')
      }
    } catch {
      setCheck('printer', 'fail', 'เกิดข้อผิดพลาดขณะตรวจสอบ')
    }

    // ── Camera ───────────────────────────────────────────────────────────────
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
      if (err?.name === 'NotAllowedError') {
        setCheck('camera', 'fail', 'ผู้ใช้ปฏิเสธสิทธิ์กล้อง — กด Allow ในเบราว์เซอร์')
      } else if (err?.name === 'NotFoundError') {
        setCheck('camera', 'warn', 'ไม่พบกล้องในอุปกรณ์นี้')
      } else {
        setCheck('camera', 'warn', err?.message ?? 'ไม่สามารถเข้าถึงกล้องได้')
      }
    }

    // ── IndexedDB ────────────────────────────────────────────────────────────
    await new Promise((r) => setTimeout(r, 100))
    try {
      if (!window.indexedDB) {
        setCheck('storage', 'fail', 'เบราว์เซอร์ไม่รองรับ IndexedDB')
      } else {
        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.open('__hardware_check__', 1)
          req.onsuccess = () => { req.result.close(); resolve() }
          req.onerror   = () => reject(req.error)
        })
        setCheck('storage', 'ok', 'IndexedDB พร้อมใช้งาน')
      }
    } catch (err: any) {
      setCheck('storage', 'fail', err?.message ?? 'ไม่สามารถเปิด IndexedDB ได้')
    }

    setRunning(false)
  }, [setCheck])

  useEffect(() => { runChecks() }, [runChecks])
  useEffect(() => { getCashDrawerStatus().then(setDrawerStatus) }, [])

  const summary = {
    ok:   checks.filter((c) => c.status === 'ok').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
  }
  const allDone = checks.every((c) => c.status !== 'idle' && c.status !== 'checking')

  return (
    <div className="space-y-6">
      <PageHeader
        title="ตรวจสอบฮาร์ดแวร์"
        subtitle="ตรวจสอบความพร้อมของอุปกรณ์ก่อนเปิดร้าน"
        primaryAction={
          <Button onClick={runChecks} disabled={running} variant="outline" size="sm">
            {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            ตรวจสอบใหม่
          </Button>
        }
      />

      {/* Summary pill */}
      {allDone && (
        <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium ${
          summary.fail > 0
            ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300'
            : summary.warn > 0
              ? 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-700/60 dark:bg-yellow-900/20 dark:text-yellow-300'
              : 'border-green-200 bg-green-50 text-green-700 dark:border-green-700/60 dark:bg-green-900/20 dark:text-green-300'
        }`}>
          {summary.fail > 0
            ? `พบปัญหา ${summary.fail} รายการ — ต้องแก้ไขก่อนใช้งาน`
            : summary.warn > 0
              ? `ผ่าน ${summary.ok} รายการ · คำเตือน ${summary.warn} รายการ`
              : `ผ่านทั้งหมด ${summary.ok} รายการ — พร้อมใช้งาน ✓`}
        </div>
      )}

      <SectionCard title="ผลการตรวจสอบ">
        <div className="divide-y">
          {checks.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.key} className="flex items-center gap-3 py-4 px-1">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${
                  item.status === 'ok'   ? 'bg-green-50  dark:bg-green-950'  :
                  item.status === 'warn' ? 'bg-yellow-50 dark:bg-yellow-950' :
                  item.status === 'fail' ? 'bg-red-50    dark:bg-red-950'    :
                  'bg-muted'
                }`}>
                  <Icon className={`h-5 w-5 ${
                    item.status === 'ok'   ? 'text-green-600'  :
                    item.status === 'warn' ? 'text-yellow-600' :
                    item.status === 'fail' ? 'text-red-500'    :
                    'text-muted-foreground'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.detail ?? item.description}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </div>
            )
          })}
        </div>
      </SectionCard>

      {/* ── Cash Drawer (Windows USB) ──────────────────────────────────────────── */}
      <SectionCard title="ลิ้นชักเก็บเงิน (Windows / USB)">
        <div className="space-y-4">
          <div className="divide-y">
            {/* API support row */}
            <div className="flex items-center gap-3 py-3 px-1">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${
                drawerStatus == null ? 'bg-muted' :
                drawerStatus.supported ? 'bg-green-50 dark:bg-green-950' : 'bg-red-50 dark:bg-red-950'
              }`}>
                <Plug className={`h-5 w-5 ${
                  drawerStatus?.supported ? 'text-green-600' :
                  drawerStatus?.supported === false ? 'text-red-500' :
                  'text-muted-foreground'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Web Serial API</p>
                <p className="text-xs text-muted-foreground">
                  {drawerStatus == null
                    ? 'กำลังตรวจสอบ...'
                    : drawerStatus.supported
                      ? 'รองรับ (Chrome / Edge บน HTTPS)'
                      : 'ไม่รองรับ — ต้องใช้ Chrome หรือ Edge'}
                </p>
              </div>
              {drawerStatus == null
                ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                : drawerStatus.supported
                  ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                  : <XCircle className="h-5 w-5 text-red-500" />}
            </div>

            {/* Port authorization row */}
            <div className="flex items-center gap-3 py-3 px-1">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${
                drawerStatus?.authorized ? 'bg-green-50 dark:bg-green-950' : 'bg-yellow-50 dark:bg-yellow-950'
              }`}>
                <Plug className={`h-5 w-5 ${
                  drawerStatus?.authorized ? 'text-green-600' : 'text-yellow-600'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">การเชื่อมต่อลิ้นชัก</p>
                <p className="text-xs text-muted-foreground">
                  {drawerStatus?.authorized
                    ? `เชื่อมต่อแล้ว · ${drawerStatus.portCount} port`
                    : 'ยังไม่ได้เชื่อมต่อ — กดปุ่มด้านล่างเพื่อเลือก port'}
                </p>
              </div>
              {drawerStatus?.authorized
                ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                : <AlertCircle className="h-5 w-5 text-yellow-500" />}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={!drawerStatus?.supported || drawerConnecting || drawerTesting}
              onClick={async () => {
                setDrawerConnecting(true)
                setDrawerTestResult(null)
                const ok = await connectCashDrawer()
                if (ok) setDrawerStatus(await getCashDrawerStatus())
                setDrawerConnecting(false)
              }}
            >
              {drawerConnecting
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <Plug className="h-4 w-4 mr-2" />}
              เชื่อมต่อลิ้นชัก
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!drawerStatus?.authorized || drawerTesting || drawerConnecting}
              onClick={async () => {
                setDrawerTesting(true)
                setDrawerTestResult(null)
                const result = await testCashDrawer()
                setDrawerTestResult(result)
                setDrawerTesting(false)
              }}
            >
              {drawerTesting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              ทดสอบเปิดลิ้นชัก
            </Button>
          </div>

          {/* Test result feedback */}
          {drawerTestResult && (
            <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
              drawerTestResult.success
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-700/60 dark:bg-green-900/20 dark:text-green-300'
                : 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-700/60 dark:bg-yellow-900/20 dark:text-yellow-300'
            }`}>
              {drawerTestResult.success
                ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                : <AlertCircle className="h-4 w-4 shrink-0" />}
              {drawerTestResult.message}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            ใช้ได้เฉพาะ Windows + Chrome/Edge · เชื่อมต่อผ่านหน้านี้ครั้งเดียว — เบราว์เซอร์จะจำไว้ · ลิ้นชักต่อผ่าน RJ11 จากเครื่องพิมพ์ AUYIN
          </p>
        </div>
      </SectionCard>

      <SectionCard title="วิธีแก้ไขปัญหา">
        <div className="space-y-3 text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-foreground mb-1">เครื่องพิมพ์ไม่พบ</p>
            <p>ตรวจสอบว่าเปิดใช้ SUNMI InnerPrinter ใน Settings → Developer Options หรือติดตั้ง APK จาก FixITPro</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">กล้องถูกปฏิเสธ</p>
            <p>เปิด Settings → App → Browser → Permissions → Camera แล้วเลือก Allow</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">ไม่มีอินเทอร์เน็ต</p>
            <p>ตรวจสอบ Wi-Fi หรือ SIM การ์ด ระบบต้องเชื่อมต่อเพื่อซิงค์ข้อมูล</p>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

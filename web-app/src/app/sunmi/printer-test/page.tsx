'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Printer, CheckCircle2, XCircle, Bluetooth, RefreshCw } from 'lucide-react'
import { SunmiShell } from '@/components/sunmi/sunmi-shell'
import { PrinterFlowSheet, type ThermalPreviewData } from '@/components/sunmi/printer-flow'
import { SunmiPrinter } from '@/lib/sunmi-printer'

const TEST_PREVIEW_DATA: ThermalPreviewData = {
  title:    'Printer Test',
  number:   'TEST',
  shopName: 'FixITPro POS',
  date:     new Date().toLocaleDateString('th-TH'),
  footer:   'ทดสอบการพิมพ์สำเร็จ',
  lines: [
    { type: 'separator' },
    { type: 'center', text: '✓ Printer Test OK' },
    { type: 'separator' },
    { type: 'row', label: 'ESC/POS', value: 'Ready' },
    { type: 'row', label: 'Thai text', value: 'ทดสอบ' },
    { type: 'row', label: 'Width', value: '58 mm' },
    { type: 'separator' },
    { type: 'center', text: 'ทดสอบเสร็จสิ้น', small: true },
  ],
}

const TEST_HTML = `<!DOCTYPE html><html lang="th"><head>
<meta charset="utf-8">
<style>
  @page { margin: 0; size: 58mm auto; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 9pt; line-height: 1.4;
         width: 54mm; padding: 1mm 2mm; color: #000; }
  .c  { text-align: center; }
  .b  { font-weight: bold; }
  .hr { border: none; border-top: 1px dashed #555; margin: 3px 0; }
</style></head><body>
<p class="c b" style="font-size:13pt">FixITPro POS</p>
<div class="hr"></div>
<p class="c b">Printer Test OK</p>
<div class="hr"></div>
<p class="c" style="font-size:8pt">ESC/POS · 58mm · 203dpi</p>
<p class="c" style="font-size:8pt">ทดสอบการพิมพ์สำเร็จ</p>
<p class="c" style="font-size:8pt">Thai font rendering OK</p>
<div class="hr"></div>
<br><br>
</body></html>`

export default function PrinterTestPage() {
  const [showFlow, setShowFlow] = useState(false)

  const { data: status, isLoading, refetch, isRefetching } = useQuery({
    queryKey:        ['printer-status'],
    queryFn:         () => SunmiPrinter.getStatus(),
    refetchInterval: 5000,
  })

  const { data: info } = useQuery({
    queryKey: ['printer-info'],
    queryFn:  () => SunmiPrinter.getDeviceInfo(),
  })

  const { data: defaultPrinter } = useQuery({
    queryKey: ['default-printer'],
    queryFn:  () => SunmiPrinter.getDefaultPrinter(),
  })

  const innerBound    = status?.innerBound    ?? false
  const btConnected   = status?.bluetoothConnected ?? false
  const anyReady      = innerBound || btConnected
  const defaultId     = defaultPrinter?.printerId ?? ''
  const defaultName   = defaultPrinter?.printerName ?? ''

  return (
    <>
      <SunmiShell
        title="ทดสอบเครื่องพิมพ์"
        rightContent={
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-10 w-10 flex items-center justify-center text-slate-300 active:text-white"
          >
            <RefreshCw className={`h-5 w-5 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
        }
      >
        <div className="p-4 space-y-4 pb-8">

          {/* Status card */}
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <p className="font-bold text-slate-700">สถานะเครื่องพิมพ์</p>

            {isLoading ? (
              <div className="flex items-center gap-2 text-slate-400">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                <span className="text-sm">กำลังตรวจสอบ...</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-sm">
                {/* SUNMI inner */}
                <div className={`flex items-center gap-2 p-3 rounded-xl ${innerBound ? 'bg-green-50' : 'bg-slate-50'}`}>
                  {innerBound
                    ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    : <Printer className="h-4 w-4 text-slate-400 shrink-0" />}
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold truncate ${innerBound ? 'text-green-700' : 'text-slate-500'}`}>
                      InnerPrinter
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {innerBound ? 'พร้อม' : 'ไม่พร้อม'}
                    </p>
                  </div>
                </div>

                {/* Bluetooth */}
                <div className={`flex items-center gap-2 p-3 rounded-xl ${btConnected ? 'bg-blue-50' : 'bg-slate-50'}`}>
                  {btConnected
                    ? <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
                    : <Bluetooth className="h-4 w-4 text-slate-400 shrink-0" />}
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold truncate ${btConnected ? 'text-blue-700' : 'text-slate-500'}`}>
                      Bluetooth
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {btConnected ? status?.connectedAddress?.slice(-5) : 'ไม่ได้เชื่อมต่อ'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Device info */}
            {info && (
              <p className="text-xs text-slate-400">{info.model}</p>
            )}

            {/* Default printer */}
            {defaultId && (
              <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                <span className="text-xs text-slate-500">ค่าเริ่มต้น:</span>
                <span className="text-xs font-semibold text-slate-700">{defaultName || defaultId}</span>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-1.5 text-xs text-slate-500">
            <p className="font-semibold text-slate-600 text-sm mb-2">วิธีใช้งาน</p>
            <p>1. กด &ldquo;พิมพ์ทดสอบ&rdquo; → เลือกเครื่องพิมพ์</p>
            <p>2. InnerPrinter: ใช้กับ SUNMI ROM เท่านั้น</p>
            <p>3. Bluetooth: จับคู่เครื่องพิมพ์ใน Android ก่อน</p>
            <p>4. ตั้งค่าเริ่มต้นเพื่อข้ามขั้นตอนเลือกเครื่องพิมพ์</p>
          </div>

          {/* Print test button */}
          <button
            onClick={() => setShowFlow(true)}
            className="w-full h-16 rounded-2xl bg-slate-800 text-white text-xl font-bold active:bg-slate-700 flex items-center justify-center gap-3"
          >
            <Printer className="h-6 w-6" />
            พิมพ์ทดสอบ
          </button>
        </div>
      </SunmiShell>

      {showFlow && (
        <PrinterFlowSheet
          receiptHtml={TEST_HTML}
          jobName="Printer Test"
          previewData={TEST_PREVIEW_DATA}
          onClose={() => setShowFlow(false)}
        />
      )}
    </>
  )
}

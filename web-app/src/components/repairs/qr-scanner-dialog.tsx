'use client'

import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScanBarcode, FlipHorizontal, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface QrScannerDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onScan: (text: string) => void
}

export function QrScannerDialog({ open, onOpenChange, onScan }: QrScannerDialogProps) {
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([])
  const [camIdx, setCamIdx]   = useState(0)
  const scannerRef            = useRef<Html5Qrcode | null>(null)
  const regionId              = 'qr-scan-region'

  useEffect(() => {
    if (!open) {
      stopScanner()
      return
    }

    let mounted = true

    async function start() {
      setLoading(true)
      setError(null)

      try {
        const devices = await Html5Qrcode.getCameras()
        if (!mounted) return
        if (!devices.length) { setError('ไม่พบกล้องในอุปกรณ์นี้'); setLoading(false); return }

        const mapped = devices.map((d) => ({ id: d.id, label: d.label || `กล้อง ${d.id.slice(-4)}` }))
        setCameras(mapped)

        const idx = Math.min(camIdx, mapped.length - 1)
        await startCamera(mapped[idx].id)
      } catch (e: any) {
        if (!mounted) return
        setError(e?.message ?? 'ไม่สามารถเข้าถึงกล้องได้')
        setLoading(false)
      }
    }

    start()
    return () => { mounted = false; stopScanner() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, camIdx])

  async function startCamera(cameraId: string) {
    const el = document.getElementById(regionId)
    if (!el) return

    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current.clear()
    }

    const qr = new Html5Qrcode(regionId)
    scannerRef.current = qr

    try {
      await qr.start(
        cameraId,
        { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
        (text) => {
          onScan(text)
          onOpenChange(false)
        },
        undefined,
      )
      setLoading(false)
    } catch (e: any) {
      setError(e?.message ?? 'เริ่มกล้องไม่ได้')
      setLoading(false)
    }
  }

  async function stopScanner() {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      try { scannerRef.current.clear() } catch {}
      scannerRef.current = null
    }
  }

  function switchCamera() {
    const next = (camIdx + 1) % Math.max(cameras.length, 1)
    setCamIdx(next)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) stopScanner(); onOpenChange(v) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="h-4 w-4 text-blue-600" />
            สแกน QR Code / Barcode
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground text-center">
            นำ QR Code หรือ Barcode ของใบงานซ่อมเข้าใกล้กล้อง
          </p>

          {/* Camera region */}
          <div className="relative rounded-xl overflow-hidden bg-black aspect-square w-full">
            <div id={regionId} className="w-full h-full" />

            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                <div className="flex flex-col items-center gap-2 text-white">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-xs">กำลังเปิดกล้อง...</p>
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
                <div className="text-center text-white">
                  <ScanBarcode className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium">ไม่สามารถเปิดกล้องได้</p>
                  <p className="text-xs text-white/70 mt-1">{error}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {cameras.length > 1 && (
              <Button variant="outline" size="sm" onClick={switchCamera} className="gap-1.5 flex-1">
                <FlipHorizontal className="h-3.5 w-3.5" />
                เปลี่ยนกล้อง ({camIdx + 1}/{cameras.length})
              </Button>
            )}
            <Button variant="outline" size="sm" className="flex-1" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground text-center">
            รองรับ QR Code, Code 128, EAN-13 และ Barcode ทั่วไป
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

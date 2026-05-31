'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Zap, ZapOff, Camera, Keyboard } from 'lucide-react'
import { pushBackHandler } from '@/lib/back-stack'

interface BarcodeScannerDialogProps {
  onScanned: (code: string) => void
  onClose: () => void
}

type ScannerState = 'starting' | 'ready' | 'unsupported' | 'denied' | 'error'

/**
 * Full-screen camera barcode scanner for web (BarcodeDetector API).
 * When BarcodeDetector is unavailable, shows a manual input fallback instead
 * of a dead error screen — user can type the barcode and press Enter.
 * On native Android the pages call nativeScan() directly; this dialog is web-only.
 */
export function BarcodeScannerDialog({ onScanned, onClose }: BarcodeScannerDialogProps) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const rafRef      = useRef<number>(0)
  const detectorRef = useRef<BarcodeDetector | null>(null)
  const lastCode    = useRef<string>('')
  const lastTime    = useRef<number>(0)
  const manualRef   = useRef<HTMLInputElement>(null)

  const [state, setState]     = useState<ScannerState>('starting')
  const [torchOn, setTorch]   = useState(false)
  const [manualCode, setManual] = useState('')

  // Android back button closes the dialog
  useEffect(() => pushBackHandler(onClose), [onClose])

  // Auto-focus manual input when unsupported/denied/error
  useEffect(() => {
    if (state === 'unsupported' || state === 'denied' || state === 'error') {
      setTimeout(() => manualRef.current?.focus(), 100)
    }
  }, [state])

  const stopStream = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const scan = useCallback(() => {
    const video    = videoRef.current
    const detector = detectorRef.current
    if (!video || !detector || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scan)
      return
    }
    detector.detect(video).then((results) => {
      if (results.length > 0) {
        const code = results[0].rawValue
        const now  = Date.now()
        if (code !== lastCode.current || now - lastTime.current > 2000) {
          lastCode.current = code
          lastTime.current = now
          onScanned(code)
        }
      }
      rafRef.current = requestAnimationFrame(scan)
    }).catch(() => {
      rafRef.current = requestAnimationFrame(scan)
    })
  }, [onScanned])

  useEffect(() => {
    if (!('BarcodeDetector' in window)) {
      setState('unsupported')
      return
    }

    let active = true

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return }

        streamRef.current = stream
        detectorRef.current = new window.BarcodeDetector!({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e', 'itf'],
        })

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        setState('ready')
        rafRef.current = requestAnimationFrame(scan)
      } catch (err: any) {
        if (!active) return
        setState(err?.name === 'NotAllowedError' ? 'denied' : 'error')
      }
    }

    start()
    return () => { active = false; stopStream() }
  }, [scan, stopStream])

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      const next = !torchOn
      await (track as any).applyConstraints({ advanced: [{ torch: next }] })
      setTorch(next)
    } catch { /* torch not supported */ }
  }

  function submitManual() {
    const code = manualCode.trim()
    if (!code) return
    onScanned(code)
    setManual('')
  }

  const showFallback = state === 'unsupported' || state === 'denied' || state === 'error'

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center h-14 px-3 shrink-0 bg-black/70">
        <button
          onClick={onClose}
          className="flex items-center justify-center h-11 w-11 rounded-xl text-white active:bg-white/20"
        >
          <X className="h-6 w-6" />
        </button>
        <p className="flex-1 text-center text-white font-bold text-base">สแกนบาร์โค้ด</p>
        {state === 'ready' ? (
          <button
            onClick={toggleTorch}
            className="flex items-center justify-center h-11 w-11 rounded-xl text-white active:bg-white/20"
          >
            {torchOn ? <Zap className="h-6 w-6 text-yellow-300" /> : <ZapOff className="h-6 w-6" />}
          </button>
        ) : (
          <div className="w-11" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 relative overflow-hidden">
        {/* Camera feed (always rendered so it can start) */}
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover ${state !== 'ready' ? 'invisible' : ''}`}
          playsInline
          muted
        />

        {/* Scan frame when camera is active */}
        {state === 'ready' && (
          <>
            <div className="absolute inset-0 bg-black/40" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-64 h-40">
                <span className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-lg" />
                <span className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-lg" />
                <span className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-lg" />
                <span className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-lg" />
                <span className="absolute left-0 right-0 h-0.5 bg-green-400 shadow-[0_0_6px_2px_rgba(74,222,128,0.8)] animate-scan-line" />
              </div>
            </div>
            <p className="absolute bottom-8 left-0 right-0 text-center text-white/80 text-sm">
              วางบาร์โค้ดไว้ในกรอบ
            </p>
          </>
        )}

        {/* Starting spinner */}
        {state === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
          </div>
        )}

        {/* Fallback: unsupported / denied / error — show manual input */}
        {showFallback && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-8">
            <div className="flex flex-col items-center gap-3 text-white">
              {state === 'unsupported' ? (
                <>
                  <Camera className="h-14 w-14 opacity-40" />
                  <p className="font-bold text-lg text-center">ใช้เครื่องสแกนหรือพิมพ์บาร์โค้ดแทน</p>
                  <p className="text-sm text-white/60 text-center">
                    เบราว์เซอร์นี้ไม่รองรับการสแกนด้วยกล้อง
                  </p>
                </>
              ) : state === 'denied' ? (
                <>
                  <Camera className="h-14 w-14 opacity-40" />
                  <p className="font-bold text-lg text-center">ไม่ได้รับอนุญาตใช้กล้อง</p>
                  <p className="text-sm text-white/60 text-center">
                    กรุณาอนุญาตกล้องในการตั้งค่า หรือพิมพ์บาร์โค้ดด้านล่าง
                  </p>
                </>
              ) : (
                <>
                  <Camera className="h-14 w-14 opacity-40" />
                  <p className="font-bold text-lg text-center">เปิดกล้องไม่ได้</p>
                  <p className="text-sm text-white/60 text-center">
                    พิมพ์บาร์โค้ดด้านล่างแทน
                  </p>
                </>
              )}
            </div>

            {/* Manual barcode input */}
            <div className="w-full max-w-sm space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    ref={manualRef}
                    value={manualCode}
                    onChange={(e) => setManual(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { submitManual(); e.preventDefault() } }}
                    placeholder="พิมพ์บาร์โค้ด / SKU..."
                    className="w-full h-13 h-12 pl-10 pr-4 rounded-xl bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-purple-400"
                    autoComplete="off"
                  />
                </div>
                <button
                  onClick={submitManual}
                  disabled={!manualCode.trim()}
                  className="h-12 px-5 rounded-xl bg-purple-600 text-white font-bold active:bg-purple-700 disabled:opacity-50"
                >
                  ค้นหา
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

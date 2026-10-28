'use client'

import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

/**
 * A box the customer signs in with a finger, stylus or mouse. Gives a PNG data URL (white
 * background, so it prints on thermal paper), or null while nothing is drawn.
 * `fill`: the box takes its parent's whole size (the full-screen signing page) and keeps the
 * drawing when the screen turns.
 */
export function SignaturePad({ onChange, height = 180, fill }: {
  onChange: (png: string | null) => void
  height?: number
  fill?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const inked = useRef(false)
  const [empty, setEmpty] = useState(true)

  // Sharp lines on high-density screens; a white background for printing
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const setup = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const width = canvas.clientWidth
      const h = fill ? canvas.clientHeight : height
      if (!width || !h) return
      // Turning the screen resizes the box: keep what is already signed, fitted to the new size
      const before = inked.current ? canvas.toDataURL('image/png') : null
      canvas.width = width * ratio
      canvas.height = h * ratio
      const ctx = canvas.getContext('2d')!
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, h)
      ctx.lineWidth = fill ? 3 : 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#111827'
      if (before) {
        const img = new Image()
        img.onload = () => {
          const s = Math.min(width / (img.width / ratio), h / (img.height / ratio), 1)
          ctx.drawImage(img, 0, 0, (img.width / ratio) * s, (img.height / ratio) * s)
          onChange(canvas.toDataURL('image/png'))
        }
        img.src = before
      }
    }
    setup()
    if (!fill || typeof ResizeObserver === 'undefined') return
    let w = canvas.clientWidth, h = canvas.clientHeight
    const ro = new ResizeObserver(() => {
      if (canvas.clientWidth === w && canvas.clientHeight === h) return
      w = canvas.clientWidth; h = canvas.clientHeight
      setup()
    })
    ro.observe(canvas)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, fill])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = point(e)
    const ctx = e.currentTarget.getContext('2d')!
    ctx.beginPath()
    ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2)
    ctx.fillStyle = '#111827'
    ctx.fill()
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return
    const p = point(e)
    const ctx = e.currentTarget.getContext('2d')!
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    if (!inked.current) { inked.current = true; setEmpty(false) }
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    const canvas = canvasRef.current
    if (canvas && inked.current) onChange(canvas.toDataURL('image/png'))
  }

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
    inked.current = false
    setEmpty(true)
    onChange(null)
  }

  const clearButton = (
    <button type="button" onClick={clear} disabled={empty}
      className="flex items-center gap-1.5 text-sm font-medium text-slate-600 disabled:opacity-40">
      <Eraser className="h-4 w-4" /> ล้างแล้วเซ็นใหม่
    </button>
  )

  return (
    <div className={fill ? 'flex h-full flex-col gap-2' : 'space-y-2'}>
      <div className={`relative rounded-xl border-2 border-dashed border-slate-300 bg-white ${fill ? 'min-h-0 flex-1' : ''}`}>
        <canvas
          ref={canvasRef}
          aria-label="ช่องเซ็นชื่อ"
          className={`block w-full touch-none rounded-xl ${fill ? 'h-full' : ''}`}
          style={fill ? undefined : { height }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
        {empty && (
          <p className={`pointer-events-none absolute inset-0 flex items-center justify-center text-slate-400 ${fill ? 'text-lg' : 'text-sm'}`}>
            เซ็นชื่อในกรอบนี้
          </p>
        )}
        <div className={`pointer-events-none absolute left-6 right-6 border-b border-slate-300 ${fill ? 'bottom-[22%]' : 'bottom-8'}`} />
      </div>
      {clearButton}
    </div>
  )
}

/**
 * Cuts the blank paper around the signature, so a signature drawn on a big screen still fills
 * the small box on the slip. Falls back to the image as drawn.
 */
export function trimSignature(png: string, pad = 12): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = img.width; c.height = img.height
        const ctx = c.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const { data } = ctx.getImageData(0, 0, c.width, c.height)
        let minX = c.width, minY = c.height, maxX = -1, maxY = -1
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            const i = (y * c.width + x) * 4
            if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) {
              if (x < minX) minX = x
              if (x > maxX) maxX = x
              if (y < minY) minY = y
              if (y > maxY) maxY = y
            }
          }
        }
        if (maxX < 0) return resolve(png)
        minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad)
        maxX = Math.min(c.width - 1, maxX + pad); maxY = Math.min(c.height - 1, maxY + pad)
        const out = document.createElement('canvas')
        out.width = maxX - minX + 1; out.height = maxY - minY + 1
        const o = out.getContext('2d')!
        o.fillStyle = '#ffffff'
        o.fillRect(0, 0, out.width, out.height)
        o.drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height)
        resolve(out.toDataURL('image/png'))
      } catch {
        resolve(png)
      }
    }
    img.onerror = () => resolve(png)
    img.src = png
  })
}

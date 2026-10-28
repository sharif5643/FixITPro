'use client'

import { useEffect, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { CheckCircle2, Loader2, RotateCw, X } from 'lucide-react'
import { SignaturePad, trimSignature } from './signature-pad'

/** A phone (not a tablet): small screen, touch */
function isPhone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(pointer: coarse)').matches && Math.min(window.screen.width, window.screen.height) < 600
}

/**
 * The signing page: the whole screen, wide, with big buttons, the same in the web (iPad), the
 * staff app and SUNMI. On a phone it asks to turn the screen sideways, and turns it itself where
 * the browser allows.
 */
export function FullscreenSignature({
  title, hint, confirmLabel = 'ยืนยันลายเซ็น', name, onNameChange, busy, onConfirm, onCancel,
}: {
  title: string
  hint?: string
  confirmLabel?: string
  /** The signer's name, when it is asked for (left out: no name field) */
  name?: string
  onNameChange?: (name: string) => void
  busy?: boolean
  onConfirm: (png: string) => void
  onCancel: () => void
}) {
  const [png, setPng] = useState<string | null>(null)
  const [portrait, setPortrait] = useState(false)

  useEffect(() => {
    const phone = isPhone()
    const check = () => setPortrait(phone && window.innerHeight > window.innerWidth)
    check()
    window.addEventListener('resize', check)
    // Phones: try to go full screen and sideways (works in Android browsers; elsewhere the hint stays)
    let entered = false
    if (phone && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen()
        .then(() => {
          entered = true
          const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
          return o?.lock?.('landscape')
        })
        .catch(() => {})
    }
    return () => {
      window.removeEventListener('resize', check)
      try { (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.() } catch { /* not supported */ }
      if (entered && document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [])

  // A Radix dialog of its own, so it also works on top of another dialog (the web intake form)
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content aria-describedby={undefined}
          onPointerDownOutside={(e) => e.preventDefault()}
          // No keyboard popping up over the signing box
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed inset-0 z-[80] flex flex-col bg-white text-slate-900 outline-none"
          style={{ padding: 'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))' }}>
          <div className="flex shrink-0 items-start gap-3">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="truncate text-base font-bold sm:text-lg">{title}</DialogPrimitive.Title>
              {hint && <p className="truncate text-xs text-slate-500 sm:text-sm">{hint}</p>}
            </div>
            {onNameChange && (
              <input value={name ?? ''} onChange={(e) => onNameChange(e.target.value)} placeholder="ชื่อผู้เซ็น (ไม่บังคับ)" maxLength={100}
                className="h-10 w-40 shrink-0 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 sm:w-56" />
            )}
            <button type="button" onClick={onCancel} aria-label="ปิด" className="shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-100">
              <X className="h-6 w-6" />
            </button>
          </div>

          {portrait && (
            <div className="mt-2 flex shrink-0 items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <RotateCw className="h-4 w-4 shrink-0" /> หมุนเครื่องเป็นแนวนอนจะเซ็นได้ง่ายขึ้น
            </div>
          )}

          <div className="mt-2 min-h-0 flex-1">
            <SignaturePad onChange={setPng} fill />
          </div>

          <div className="mt-2 flex shrink-0 gap-2">
            <button type="button" onClick={onCancel}
              className="h-12 flex-1 rounded-2xl border border-slate-200 text-base font-semibold text-slate-700 sm:flex-none sm:px-8">
              ยกเลิก
            </button>
            <button type="button" onClick={async () => { if (png) onConfirm(await trimSignature(png)) }} disabled={!png || busy}
              className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-2xl bg-slate-900 text-base font-bold text-white disabled:opacity-40">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
              {confirmLabel}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConfirmVariant = 'success' | 'warning' | 'danger' | 'info'

export interface ConfirmActionDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (reason?: string) => void
  title: string
  description: string | React.ReactNode
  icon?: React.ElementType
  variant?: ConfirmVariant
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  requireReason?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
  /** 'md' = h-12 (desktop default), 'lg' = h-14 (SUNMI / touch) */
  buttonSize?: 'md' | 'lg'
}

// ── Variant config ────────────────────────────────────────────────────────────

const VARIANT_CFG: Record<ConfirmVariant, {
  icon_bg: string
  icon_color: string
  confirm_cls: string
}> = {
  success: {
    icon_bg:     'bg-green-100',
    icon_color:  'text-green-600',
    confirm_cls: 'bg-green-600 hover:bg-green-700 active:bg-green-800 focus-visible:ring-green-500',
  },
  warning: {
    icon_bg:     'bg-amber-100',
    icon_color:  'text-amber-600',
    confirm_cls: 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 focus-visible:ring-amber-400',
  },
  danger: {
    icon_bg:     'bg-red-100',
    icon_color:  'text-red-600',
    confirm_cls: 'bg-red-600 hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500',
  },
  info: {
    icon_bg:     'bg-blue-100',
    icon_color:  'text-blue-600',
    confirm_cls: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-blue-500',
  },
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ConfirmActionDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  icon: Icon,
  variant = 'info',
  confirmLabel = 'ยืนยัน',
  cancelLabel  = 'ยกเลิก',
  loading = false,
  requireReason = false,
  reasonLabel = 'เหตุผล',
  reasonPlaceholder = 'ระบุเหตุผล...',
  buttonSize = 'md',
}: ConfirmActionDialogProps) {
  const [reason, setReason] = useState('')
  const cfg = VARIANT_CFG[variant]
  const btnH = buttonSize === 'lg' ? 'h-14 text-base' : 'h-12 text-sm'
  const confirmDisabled = loading || (requireReason && !reason.trim())

  // Reset reason when dialog closes
  useEffect(() => {
    if (!open) setReason('')
  }, [open])

  function handleConfirm() {
    if (confirmDisabled) return
    onConfirm(requireReason ? reason.trim() : undefined)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && !e.shiftKey && !requireReason) handleConfirm()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => !loading && onClose()}
            aria-hidden="true"
          />

          {/* Dialog — bottom-sheet on mobile, centered on sm+ */}
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none"
            onKeyDown={handleKeyDown}
          >
            <motion.div
              key="dialog"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: 'spring', duration: 0.3, bounce: 0.18 }}
              className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cad-title"
            >
              {/* Drag handle for mobile */}
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="h-1 w-10 rounded-full bg-slate-300" />
              </div>

              <div className="px-6 pt-4 pb-6 sm:pt-6 space-y-4">
                {/* Close button (top-right) */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {Icon && (
                      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', cfg.icon_bg)}>
                        <Icon className={cn('h-5 w-5', cfg.icon_color)} />
                      </div>
                    )}
                    <h2 id="cad-title" className="text-lg font-bold text-slate-900 leading-tight">
                      {title}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => !loading && onClose()}
                    disabled={loading}
                    className="mt-0.5 shrink-0 rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-40"
                    aria-label="ปิด"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Description */}
                <p className="text-sm text-slate-600 leading-relaxed">
                  {description}
                </p>

                {/* Reason input */}
                {requireReason && (
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">
                      {reasonLabel}
                      <span className="ml-1 text-red-500">*</span>
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={reasonPlaceholder}
                      rows={2}
                      disabled={loading}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 transition-shadow"
                    />
                  </div>
                )}

                {/* Buttons */}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => !loading && onClose()}
                    disabled={loading}
                    className={cn(
                      'flex-1 rounded-2xl border-2 border-slate-200 font-semibold text-slate-600',
                      'hover:bg-slate-50 active:bg-slate-100 transition-colors',
                      'disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                      btnH,
                    )}
                  >
                    {cancelLabel}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={confirmDisabled}
                    className={cn(
                      'flex-1 rounded-2xl font-semibold text-white',
                      'flex items-center justify-center gap-2',
                      'disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2',
                      'transition-colors shadow-sm',
                      cfg.confirm_cls,
                      btnH,
                    )}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                        กำลังดำเนินการ...
                      </>
                    ) : (
                      confirmLabel
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

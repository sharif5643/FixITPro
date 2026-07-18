import { useEffect, useRef } from 'react'
import { Platform } from '@/lib/platform'

export interface POSShortcutHandlers {
  /** F2 — focus product search input */
  onFocusSearch: () => void
  /** F3 — open customer search dialog */
  onFocusCustomerSearch: () => void
  /** F4 — focus discount input */
  onFocusDiscount: () => void
  /** F5 — select QR payment method */
  onSelectQR: () => void
  /** F6 — select CASH payment method + focus cash input */
  onSelectCash: () => void
  /** F7 — select TRANSFER payment method */
  onSelectTransfer: () => void
  /** F8 — open checkout dialog */
  onCheckout: () => void
  /** Ctrl+Backspace — clear entire cart */
  onClearCart: () => void
  /** Escape — clear search text or close topmost overlay */
  onEscape: () => void
  /** + key (when not in input) — increase qty of last cart item */
  onIncreaseQty: () => void
  /** - key (when not in input) — decrease qty of last cart item */
  onDecreaseQty: () => void
  /** Whether to install the listener (default true) */
  enabled?: boolean
}

/**
 * Global keyboard shortcuts for the POS page.
 *
 * Key map:
 *   F2 = ค้นหาสินค้า    F3 = ค้นหาลูกค้า   F4 = ส่วนลด
 *   F5 = QR             F6 = เงินสด         F7 = โอน
 *   F8 = คิดเงิน
 *
 * Disabled on SUNMI/touch-only devices.
 * All callbacks are kept in a ref so the effect re-runs only when `enabled` changes.
 */
export function usePOSShortcuts({
  onFocusSearch,
  onFocusCustomerSearch,
  onFocusDiscount,
  onSelectQR,
  onSelectCash,
  onSelectTransfer,
  onCheckout,
  onClearCart,
  onEscape,
  onIncreaseQty,
  onDecreaseQty,
  enabled = true,
}: POSShortcutHandlers) {
  const cb = useRef({
    onFocusSearch,
    onFocusCustomerSearch,
    onFocusDiscount,
    onSelectQR,
    onSelectCash,
    onSelectTransfer,
    onCheckout,
    onClearCart,
    onEscape,
    onIncreaseQty,
    onDecreaseQty,
  })

  useEffect(() => {
    cb.current = {
      onFocusSearch,
      onFocusCustomerSearch,
      onFocusDiscount,
      onSelectQR,
      onSelectCash,
      onSelectTransfer,
      onCheckout,
      onClearCart,
      onEscape,
      onIncreaseQty,
      onDecreaseQty,
    }
  })

  useEffect(() => {
    if (!enabled || Platform.isSunmiShell()) return

    function handler(e: KeyboardEvent) {
      const el     = document.activeElement as HTMLElement | null
      const tag    = el?.tagName?.toLowerCase() ?? ''
      const inInput = tag === 'input' || tag === 'textarea' || tag === 'select'

      switch (e.key) {
        case 'F2': e.preventDefault(); cb.current.onFocusSearch(); return
        case 'F3': e.preventDefault(); cb.current.onFocusCustomerSearch(); return
        case 'F4': e.preventDefault(); cb.current.onFocusDiscount(); return
        case 'F5': e.preventDefault(); cb.current.onSelectQR(); return
        case 'F6': e.preventDefault(); cb.current.onSelectCash(); return
        case 'F7': e.preventDefault(); cb.current.onSelectTransfer(); return
        case 'F8': e.preventDefault(); cb.current.onCheckout(); return
        case 'Escape': cb.current.onEscape(); return
      }

      if (inInput) return

      if (e.ctrlKey && e.key === 'Backspace') {
        e.preventDefault()
        cb.current.onClearCart()
        return
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        cb.current.onIncreaseQty()
        return
      }
      if (e.key === '-') {
        e.preventDefault()
        cb.current.onDecreaseQty()
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled])
}

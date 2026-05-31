import { useEffect, useRef } from 'react'
import { Platform } from '@/lib/platform'

export interface POSShortcutHandlers {
  /** F2 — open checkout dialog */
  onCheckout: () => void
  /** F4 — focus product search input */
  onFocusSearch: () => void
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
 * Shortcuts are DISABLED on SUNMI/touch-only devices so they cannot interfere
 * with the on-screen keyboard or touch flow.
 *
 * All callbacks are kept in a ref so the effect re-runs only when `enabled`
 * changes — callers don't need to memoize handlers.
 */
export function usePOSShortcuts({
  onCheckout,
  onFocusSearch,
  onClearCart,
  onEscape,
  onIncreaseQty,
  onDecreaseQty,
  enabled = true,
}: POSShortcutHandlers) {
  const cb = useRef({
    onCheckout,
    onFocusSearch,
    onClearCart,
    onEscape,
    onIncreaseQty,
    onDecreaseQty,
  })

  // Keep callback ref current without re-triggering the effect
  useEffect(() => {
    cb.current = {
      onCheckout,
      onFocusSearch,
      onClearCart,
      onEscape,
      onIncreaseQty,
      onDecreaseQty,
    }
  })

  useEffect(() => {
    // Never install on SUNMI — touch flow must not be broken by accidental keys
    if (!enabled || Platform.isSunmiShell()) return

    function handler(e: KeyboardEvent) {
      const el  = document.activeElement as HTMLElement | null
      const tag = el?.tagName?.toLowerCase() ?? ''
      const inInput = tag === 'input' || tag === 'textarea' || tag === 'select'

      // F-keys and Esc work regardless of focus
      if (e.key === 'F2') {
        e.preventDefault()
        cb.current.onCheckout()
        return
      }

      if (e.key === 'F4') {
        e.preventDefault()
        cb.current.onFocusSearch()
        return
      }

      if (e.key === 'Escape') {
        // Let the Escape bubble for dialogs first via their own handlers,
        // then call ours for search clearing if no dialog consumed it.
        cb.current.onEscape()
        return
      }

      // The shortcuts below only fire when the user is NOT typing in a field
      if (inInput) return

      if (e.ctrlKey && e.key === 'Backspace') {
        e.preventDefault()
        cb.current.onClearCart()
        return
      }

      // + / = both map to "increase"
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
  }, [enabled]) // intentionally sparse — callbacks accessed via ref
}

import { useEffect, useRef } from 'react'

/**
 * Captures HID barcode scanner input (USB/SUNMI built-in).
 *
 * Scanners send rapid keystrokes (< 50 ms apart) followed by Enter.
 * Regular keyboard input is slower and therefore ignored.
 *
 * The callback fires only when NO input/textarea element is focused,
 * so the user can still type in search boxes without triggering this.
 */
export function useNativeScanner(onScan: (barcode: string) => void): void {
  const bufferRef  = useRef('')
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(onScan)

  // Keep callback ref current without re-running the effect
  useEffect(() => {
    callbackRef.current = onScan
  })

  useEffect(() => {
    const SCANNER_THRESHOLD_MS = 50

    function handleKeyDown(e: KeyboardEvent) {
      const active = document.activeElement
      const isInputFocused =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement

      // If the user is typing in a field, skip — the scanner input goes there naturally
      if (isInputFocused) return

      if (e.key === 'Enter') {
        const code = bufferRef.current.trim()
        if (code.length >= 3) {
          callbackRef.current(code)
        }
        bufferRef.current = ''
        if (timerRef.current) clearTimeout(timerRef.current)
        return
      }

      // Only capture printable characters
      if (e.key.length === 1) {
        bufferRef.current += e.key
        // Reset buffer if no new keystroke within threshold (= user typed slowly)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
          bufferRef.current = ''
        }, SCANNER_THRESHOLD_MS)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, []) // intentionally empty — uses refs
}

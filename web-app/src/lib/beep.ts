/**
 * Short audio feedback using Web Audio API.
 * Works on desktop + Android WebView. Silently no-ops if AudioContext is blocked.
 */
let _ctx: AudioContext | null = null

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!_ctx) _ctx = new AudioContext()
    // Resume suspended context (autoplay policy)
    if (_ctx.state === 'suspended') _ctx.resume()
    return _ctx
  } catch {
    return null
  }
}

function tone(
  freq: number,
  freq2: number | null,
  duration: number,
  volume = 0.18,
) {
  const c = ctx()
  if (!c) return

  const osc  = c.createOscillator()
  const gain = c.createGain()
  osc.connect(gain)
  gain.connect(c.destination)

  osc.type = 'square'
  osc.frequency.setValueAtTime(freq, c.currentTime)
  if (freq2 !== null) {
    osc.frequency.setValueAtTime(freq2, c.currentTime + duration * 0.5)
  }

  gain.gain.setValueAtTime(volume, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration)

  osc.start(c.currentTime)
  osc.stop(c.currentTime + duration)
}

/** Two-tone ascending beep — barcode scan success / item added. */
export function beepSuccess() {
  tone(880, 1320, 0.12)
}

/** Low descending beep — scan failure / out-of-stock. */
export function beepError() {
  tone(330, 220, 0.18)
}

/** Haptic pulse on Android WebView (SUNMI). Silent on desktop. */
export function haptic(duration = 40) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(duration)
    }
  } catch {
    // ignore
  }
}

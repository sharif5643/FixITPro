/**
 * Alert sound + haptic utilities for the Smart Reminder system.
 * Each alert ID only triggers sound once per session (deduplication via module-level Set).
 */

const _played = new Set<string>()

/** Play a soft notification beep. On CRITICAL variant, plays a two-tone pattern. */
export function playAlertSound(
  alertId:  string,
  variant:  'soft' | 'critical' = 'soft',
  enabled = true,
): void {
  if (!enabled) return
  if (_played.has(alertId)) return
  _played.add(alertId)

  try {
    const ctx  = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'

    if (variant === 'critical') {
      osc.frequency.setValueAtTime(1000, ctx.currentTime)
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.setValueAtTime(0.25, ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(0,    ctx.currentTime + 0.15)
      gain.gain.setValueAtTime(0.25, ctx.currentTime + 0.2)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
    } else {
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.18, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.3)
    }
  } catch { /* audio context unavailable */ }
}

export async function triggerHaptic(): Promise<void> {
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle.Medium })
  } catch { /* haptics unavailable */ }
}

/** Clear the played-once set — useful after settings change or tests. */
export function resetPlayedAlerts(): void {
  _played.clear()
}

/** Check if an alert has already played sound (for testing). */
export function hasPlayed(alertId: string): boolean {
  return _played.has(alertId)
}

// ── Per-type sounds (Phase 16) ────────────────────────────────────────────────

type ToneStep = { freq: number; startAt: number; duration: number }

// Tone profiles per reminder type — distinct so staff can tell them apart
const TYPE_TONES: Record<string, ToneStep[]> = {
  VIP_REPAIR: [              // Rising triad — G4 → C5 → E5 (premium)
    { freq: 784,  startAt: 0.00, duration: 0.20 },
    { freq: 1047, startAt: 0.22, duration: 0.20 },
    { freq: 1319, startAt: 0.44, duration: 0.25 },
  ],
  URGENT_REPAIR: [           // Double ascending beep
    { freq: 880,  startAt: 0.00, duration: 0.15 },
    { freq: 1100, startAt: 0.20, duration: 0.15 },
  ],
  PARTS_REQUEST_PENDING: [   // Descending double pulse (something missing)
    { freq: 1100, startAt: 0.00, duration: 0.12 },
    { freq: 880,  startAt: 0.16, duration: 0.12 },
  ],
  TRANSFER_PENDING: [        // Single mellow chime
    { freq: 660,  startAt: 0.00, duration: 0.30 },
  ],
  PICKUP_WAITING: [          // Rising triplet bells — C5 → D5 → E5
    { freq: 1047, startAt: 0.00, duration: 0.10 },
    { freq: 1175, startAt: 0.13, duration: 0.10 },
    { freq: 1319, startAt: 0.26, duration: 0.12 },
  ],
  critical_pulse: [          // Rapid three-burst alarm (appended for CRITICAL severity)
    { freq: 1200, startAt: 0.00, duration: 0.06 },
    { freq: 1200, startAt: 0.10, duration: 0.06 },
    { freq: 1200, startAt: 0.20, duration: 0.06 },
  ],
}

/**
 * Play a sound profile for a specific reminder type.
 * Uses per-type tones so staff can distinguish reminders by ear.
 * If severity is CRITICAL, a pulse burst follows 350ms after the type tone.
 * No session-level dedup here — caller is responsible for anti-spam.
 */
export function playTypedSound(
  type:     string,
  severity: 'CRITICAL' | 'WARNING' | 'INFO' = 'INFO',
  volume  = 0.8,
): void {
  try {
    const ctx   = new (window.AudioContext || (window as any).webkitAudioContext)()
    const steps = TYPE_TONES[type] ?? TYPE_TONES.URGENT_REPAIR

    const playSteps = (tones: ToneStep[], offsetSec = 0) => {
      for (const step of tones) {
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = step.freq
        const t0 = ctx.currentTime + offsetSec + step.startAt
        gain.gain.setValueAtTime(volume * 0.7, t0)
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + step.duration)
        osc.start(t0)
        osc.stop(t0 + step.duration + 0.05)
      }
    }

    playSteps(steps, 0)
    if (severity === 'CRITICAL') {
      playSteps(TYPE_TONES.critical_pulse, 0.35)
    }
  } catch { /* AudioContext unavailable (SSR, some browsers, SUNMI quirks) */ }
}

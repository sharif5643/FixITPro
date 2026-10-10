import { useEffect, useRef } from 'react'

/**
 * Half-filled forms kept on this device, so leaving the page (or closing the dialog by mistake)
 * does not lose what was typed. Photos are not kept. A draft older than a day is dropped.
 */
const MAX_AGE_MS = 24 * 60 * 60_000
const storageKey = (key: string) => `fixitpro-draft-${key}`

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(storageKey(key))
    if (!raw) return null
    const { savedAt, data } = JSON.parse(raw) as { savedAt: number; data: T }
    if (!savedAt || Date.now() - savedAt > MAX_AGE_MS) {
      localStorage.removeItem(storageKey(key))
      return null
    }
    return data
  } catch {
    return null
  }
}

export function saveDraft<T>(key: string, data: T): void {
  try { localStorage.setItem(storageKey(key), JSON.stringify({ savedAt: Date.now(), data })) } catch { /* private window / full */ }
}

export function clearDraft(key: string): void {
  try { localStorage.removeItem(storageKey(key)) } catch { /* private window */ }
}

/**
 * Saves `data` shortly after it stops changing while `active`. Nothing is saved while the form
 * is still empty (`hasContent` false), so opening and closing a form leaves no draft behind.
 */
export function useDraftAutosave<T>(key: string | null, data: T, active: boolean, hasContent: boolean): void {
  const json = JSON.stringify(data)
  const latest = useRef(json)
  latest.current = json
  useEffect(() => {
    if (!key || !active || !hasContent) return
    const t = setTimeout(() => saveDraft(key, JSON.parse(latest.current)), 400)
    return () => clearTimeout(t)
  }, [key, json, active, hasContent])
}

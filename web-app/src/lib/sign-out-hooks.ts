/**
 * What one person leaves behind must not show to the next person on the same device.
 * - on sign-out: data fetched from the server (the query cache) is dropped
 * - on sign-in by a different person: their cart and selected branch are dropped
 * The SUNMI offline queue (sales not yet sent) is never touched here.
 * A registry with no imports, so stores can register without import cycles.
 */
type Hook = () => void

const onSignOut: Hook[] = []
const onUserChange: Hook[] = []

export function registerOnSignOut(fn: Hook) { onSignOut.push(fn) }
export function registerOnUserChange(fn: Hook) { onUserChange.push(fn) }

export function runSignOut() { for (const fn of onSignOut) { try { fn() } catch { /* never block sign-out */ } } }
export function runUserChange() { for (const fn of onUserChange) { try { fn() } catch { /* never block sign-in */ } } }

const LAST_USER_KEY = 'fixitpro-last-user'

/** Call when someone signs in: a different person from last time starts with nothing left over */
export function noteSignedIn(userId: string) {
  let last: string | null = null
  try { last = localStorage.getItem(LAST_USER_KEY) } catch { /* private mode */ }
  if (last && last !== userId) runUserChange()
  try { localStorage.setItem(LAST_USER_KEY, userId) } catch { /* private mode */ }
}

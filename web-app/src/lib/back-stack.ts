type BackHandler = () => void

const stack: BackHandler[] = []

/**
 * Push a handler onto the Android back-button stack.
 * Returns a cleanup function that removes the handler.
 * The top-most handler is called first (LIFO).
 */
export function pushBackHandler(fn: BackHandler): () => void {
  stack.push(fn)
  return () => {
    const idx = stack.lastIndexOf(fn)
    if (idx !== -1) stack.splice(idx, 1)
  }
}

/**
 * Call from the Capacitor backButton listener.
 * Returns true if a handler consumed the event (caller should NOT do history.back()).
 */
export function handleAndroidBack(): boolean {
  const handler = stack[stack.length - 1]
  if (handler) {
    handler()
    return true
  }
  return false
}

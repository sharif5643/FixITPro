/** This phone's notification token (no imports: api.ts reads it on every logout call). */
export const PUSH_TOKEN_KEY = 'fixitpro:push-token'

export function storedPushToken(): string | null {
  try { return localStorage.getItem(PUSH_TOKEN_KEY) } catch { return null }
}

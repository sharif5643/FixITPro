/**
 * Platform-wide keys: FixITPro's LINE account and the AI key for reading screenshots. The super
 * admin pastes them in the web (stored in PlatformSecret, kept here in memory); a server
 * environment variable of the same name wins, so existing installs keep working.
 */
export const PLATFORM_SECRET_KEYS = ['LINE_OA_ID', 'LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN', 'ANTHROPIC_API_KEY'] as const;
export type PlatformSecretKey = typeof PLATFORM_SECRET_KEYS[number];

const cache = new Map<string, string>();

export function platformSecret(key: PlatformSecretKey): string {
  return process.env[key]?.trim() || cache.get(key) || '';
}

/** Where a key comes from, for the settings page (values are never shown). */
export function platformSecretSource(key: PlatformSecretKey): 'env' | 'web' | null {
  if (process.env[key]?.trim()) return 'env';
  return cache.get(key) ? 'web' : null;
}

export function loadPlatformSecrets(rows: { key: string; value: string }[]) {
  cache.clear();
  for (const r of rows) if (r.value.trim()) cache.set(r.key, r.value.trim());
}

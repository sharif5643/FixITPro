import type { CapacitorConfig } from '@capacitor/cli'

/*
 * APK Architecture: Live Server URL Model
 * ─────────────────────────────────────────────────────────────────────────────
 * The Android APK is a WebView that points to the SAME Next.js server that
 * browser users access. There is ONE backend, ONE database, ONE frontend build.
 *
 * ┌─────────────────────────┐
 * │   Browser users         │──┐
 * │   (web.fixitpro.com)    │  │   ┌────────────────┐   ┌──────────────┐
 * └─────────────────────────┘  ├──▶│ Next.js Server │──▶│  NestJS API  │──▶ PostgreSQL
 * ┌─────────────────────────┐  │   │  :3001 / prod  │   │   :3000      │
 * │   APK users (SUNMI POS) │──┘   └────────────────┘   └──────────────┘
 * │   server.url → prod URL │
 * └─────────────────────────┘
 *     + Native SUNMI plugin bridge
 *
 * Benefits:
 * - One deployment, both platforms update simultaneously
 * - No static export complexity
 * - Native plugins (SUNMI printer, scanner) still work via Capacitor bridge
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Set CAPACITOR_SERVER_URL in your environment before running `npx cap sync`:
//   LAN dev:    CAPACITOR_SERVER_URL=http://192.168.1.171:3001 npx cap sync android
//   Production: CAPACITOR_SERVER_URL=https://pos.yourshop.com  npx cap sync android
// If not set, the APK serves bundled files from webDir (requires a prior `npm run build:export`).
const SERVER_URL = process.env.CAPACITOR_SERVER_URL

// CAPACITOR_APP_ID and CAPACITOR_APP_NAME can be set before `npx cap sync`
// to produce PROD vs DEV APKs that coexist on the same device.
//   PROD: appId=com.fixitpro.pos  appName=FixITPro PROD
//   DEV:  appId=com.fixitpro.dev  appName=FixITPro DEV
const config: CapacitorConfig = {
  appId: process.env.CAPACITOR_APP_ID || 'com.fixitpro.pos',
  appName: process.env.CAPACITOR_APP_NAME || 'FixITPro POS',

  // Static export output dir — used when SERVER_URL is not set
  webDir: 'out',

  server: {
    // Only set the live URL when explicitly configured; otherwise use bundled files.
    ...(SERVER_URL ? { url: SERVER_URL } : {}),

    // Allow cleartext HTTP for LAN connections (http://192.168.x.x).
    // Safe to leave on — HTTPS URLs still use TLS normally.
    cleartext: true,

    androidScheme: 'https',
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      androidSplashResourceName: 'splash',
      showSpinnerOnLoad: false,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#0f172a',
      overlaysWebView: false,
    },
  },
}

export default config

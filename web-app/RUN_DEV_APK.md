# FixITPro DEV APK — Install & Run Guide

**Target device:** SUNMI V2 Pro (or any Android ≥ 7.0 / API 24)  
**Package ID:** `com.fixitpro.dev` (installs alongside PROD — different icon/name)  
**App name on device:** FixITPro DEV  
**Server URL:** `http://192.168.1.172:3001` (Next.js DEV server on your LAN)  
**APK location:** `android/app/build/outputs/apk/dev/debug/app-dev-debug.apk`

---

## Prerequisites

### On your Windows dev machine
- Android SDK installed (`C:\Users\asus\AppData\Local\Android\Sdk`)
- ADB in PATH, or use full path: `C:\Users\asus\AppData\Local\Android\Sdk\platform-tools\adb.exe`
- Node.js + npm

### On the SUNMI device
1. Go to **Settings → About Device** → tap Build Number 7 times to enable Developer Options
2. Go to **Settings → Developer Options** → enable **USB Debugging**
3. Connect via USB (accept the RSA fingerprint prompt on the device)

### Network
- Dev machine and SUNMI must be on **the same LAN/Wi-Fi**
- Dev machine IP must be `192.168.1.172` (or update `capacitor.config.ts` and rebuild)
- Next.js server must be running: `npm run dev` inside `web-app/`

---

## Install the APK

### Option 1 — ADB (USB, recommended for first install)

```powershell
# From web-app directory
npm run apk:dev:install

# Or manually:
adb install -r android/app/build/outputs/apk/dev/debug/app-dev-debug.apk
```

If multiple devices are connected, specify the device:
```powershell
adb devices                          # find device serial
adb -s <SERIAL> install -r android/app/build/outputs/apk/dev/debug/app-dev-debug.apk
```

### Option 2 — Copy APK to device

1. Copy `android/app/build/outputs/apk/dev/debug/app-dev-debug.apk` to the device via USB file transfer
2. On the device, open a file manager and tap the APK
3. Allow **Install from unknown sources** if prompted (Settings → Security → Unknown Sources)

### Option 3 — QR/Share

Use any tool to generate a QR code pointing to the APK file served from your machine:
```powershell
# Serve APK temporarily (requires Python)
python -m http.server 8080 --directory android/app/build/outputs/apk/dev/debug
# Then scan http://192.168.1.172:8080/app-dev-debug.apk on the device
```

---

## Run

1. Start the Next.js dev server:
   ```powershell
   # In D:\FixITPro\web-app
   npm run dev
   ```
2. Start the NestJS backend:
   ```powershell
   # In D:\FixITPro\backend
   npm run start:dev
   ```
3. Open **FixITPro DEV** on the SUNMI device (amber/orange icon)
4. The app opens `http://192.168.1.172:3001` in fullscreen WebView

---

## Rebuild the DEV APK

Run this after any config/plugin change:

```powershell
cd D:\FixITPro\web-app

# Option A — one command (sync + build)
npm run apk:dev

# Option B — step by step
$env:CAPACITOR_SERVER_URL = 'http://192.168.1.172:3001'
$env:CAPACITOR_APP_ID     = 'com.fixitpro.dev'
$env:CAPACITOR_APP_NAME   = 'FixITPro DEV'
npx cap sync android
cd android
.\gradlew assembleDevDebug
```

Output APK: `android/app/build/outputs/apk/dev/debug/app-dev-debug.apk`

> **Note:** You do NOT need to rebuild for every code change. The APK is a WebView that loads the live Next.js server — just refresh the page or reopen the app.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "ERR_CLEARTEXT_NOT_PERMITTED" | Rebuild APK — `network_security_config.xml` must have `cleartext: true` (already set) |
| App shows blank / connection refused | Verify Next.js is running on port 3001 and both devices are on the same network |
| "INSTALL_FAILED_UPDATE_INCOMPATIBLE" | Uninstall the old APK first: `adb uninstall com.fixitpro.dev` |
| ADB not found | Add `C:\Users\asus\AppData\Local\Android\Sdk\platform-tools` to your PATH |
| Device not listed by `adb devices` | Enable USB Debugging, accept RSA fingerprint on device, try different USB port/cable |
| SUNMI printer/scanner not working | These use native Capacitor plugins (SunmiPrinterPlugin.kt / BarcodeScannerPlugin.kt) — check logcat: `adb logcat -s FixITPro` |
| App crashes on open | Check: `adb logcat -s AndroidRuntime` for stack trace |

---

## APK Details

| Property | Value |
|---|---|
| Package ID | `com.fixitpro.dev` |
| App Name | FixITPro DEV |
| Version | 1.0.0-dev |
| Min SDK | API 24 (Android 7.0 Nougat) |
| Target SDK | API 36 |
| Flavor | `devDebug` |
| Server | `http://192.168.1.172:3001` |
| Cleartext HTTP | Enabled (LAN dev) |
| Permissions | INTERNET, CAMERA, VIBRATE, BLUETOOTH, BLUETOOTH_CONNECT, BLUETOOTH_SCAN |
| Splash screen | Dark (#0F172A), 1.5 s auto-hide |
| Build type | debug (unsigned release key) |
| File upload | Enabled via FileProvider |
| SUNMI features | Inner printer + barcode scanner via native plugins |

---

## Notes

- This is a **DEV APK only** — do not distribute
- PROD APK (`com.fixitpro.pos`) is built separately when ready for release
- Both APKs can coexist on the same device (different package IDs)
- The DEV icon has an **amber/orange background** to distinguish it from PROD
- All UI changes are live once the Next.js server reloads — no APK rebuild needed

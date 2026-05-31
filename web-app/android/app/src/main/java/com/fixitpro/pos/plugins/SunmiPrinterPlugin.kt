package com.fixitpro.pos.plugins

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.os.Build
import android.os.IBinder
import android.util.Log
import android.view.View
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.sunmi.innerprinterservice.IWoyouService
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.Executors

// Standard Bluetooth SPP (Serial Port Profile) UUID — used by all Bluetooth thermal printers
private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

// ESC/POS byte constants
private val ESC = 0x1B.toByte()
private val GS  = 0x1D.toByte()

/*
 * SunmiPrinterPlugin — Production thermal printer integration
 *
 * Print path: HTML → off-screen WebView → Bitmap (384px wide) → ESC/POS raster bytes → printer
 *
 * Supported printers:
 *  1. SUNMI InnerPrinter — via AIDL binding to com.sunmi.innerprinterservice
 *     Works on devices running SUNMI OEM ROM. Gracefully absent on flashed ROMs.
 *  2. Bluetooth thermal printers — any SPP-compatible thermal printer (RPP300, MTP-II, etc.)
 *     Lists paired devices from Android BluetoothAdapter.
 *
 * Printer selection: stored in SharedPreferences "printer_prefs".
 * ESC/POS raster: GS v 0 command (universally supported across thermal printer brands).
 * Thai text: rendered correctly by WebView — no encoding issues.
 */
@CapacitorPlugin(name = "SunmiPrinter")
class SunmiPrinterPlugin : Plugin() {

    // Background thread for Bluetooth I/O and bitmap conversion (never block UI thread)
    private val executor = Executors.newCachedThreadPool()

    private val prefs get() = context.getSharedPreferences("printer_prefs", Context.MODE_PRIVATE)

    // Hold WebView reference alive while printing (prevents GC mid-render)
    private var printWebView: WebView? = null

    // ── SUNMI InnerPrinter AIDL ───────────────────────────────────────────────

    private var woyouService: IWoyouService? = null
    private var innerBound = false

    private val sunmiConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            woyouService = IWoyouService.Stub.asInterface(binder)
            innerBound = true
        }
        override fun onServiceDisconnected(name: ComponentName?) {
            woyouService = null
            innerBound = false
        }
    }

    private fun tryBindSunmi() {
        try {
            val intent = Intent().apply {
                setPackage("com.sunmi.innerprinterservice")
                action = "woyou.aidl.transprinter.IWoyouService"
            }
            context.bindService(intent, sunmiConnection, Context.BIND_AUTO_CREATE)
        } catch (_: Exception) {
            // Service not installed on this ROM — innerBound stays false
        }
    }

    // ── Bluetooth state ───────────────────────────────────────────────────────

    private var btSocket: BluetoothSocket? = null
    private var btOut: OutputStream? = null
    private var btConnectedAddress: String? = null

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun load() {
        super.load()
        tryBindSunmi()
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        if (innerBound) try { context.unbindService(sunmiConnection) } catch (_: Exception) {}
        closeBluetooth()
    }

    private fun closeBluetooth() {
        try { btSocket?.close() } catch (_: Exception) {}
        btSocket = null; btOut = null; btConnectedAddress = null
    }

    // ── Printer discovery ─────────────────────────────────────────────────────

    @PluginMethod
    fun getAvailablePrinters(call: PluginCall) {
        val list = JSArray()

        // SUNMI InnerPrinter — listed always; available only when AIDL bound
        list.put(JSObject().apply {
            put("id",        "inner")
            put("name",      "SUNMI InnerPrinter")
            put("type",      "inner")
            put("available", innerBound)
            put("address",   "")
        })

        // Paired Bluetooth devices
        try {
            getBluetoothAdapter()?.let { adapter ->
                @Suppress("MissingPermission")
                adapter.bondedDevices?.forEach { dev ->
                    list.put(JSObject().apply {
                        put("id",        "bt:${dev.address}")
                        put("name",      dev.name ?: dev.address)
                        put("type",      "bluetooth")
                        put("available", true)
                        put("address",   dev.address)
                    })
                }
            }
        } catch (_: SecurityException) {
            // Bluetooth permission denied; BT devices won't appear — user must grant it
        }

        call.resolve(JSObject().apply { put("printers", list) })
    }

    @PluginMethod
    fun getDefaultPrinter(call: PluginCall) {
        call.resolve(JSObject().apply {
            put("printerId",   prefs.getString("default_printer_id",   "") ?: "")
            put("printerName", prefs.getString("default_printer_name", "") ?: "")
        })
    }

    @PluginMethod
    fun setDefaultPrinter(call: PluginCall) {
        val id   = call.getString("printerId")   ?: ""
        val name = call.getString("printerName") ?: ""
        prefs.edit()
            .putString("default_printer_id",   id)
            .putString("default_printer_name", name)
            .apply()
        call.resolve(JSObject().apply { put("success", true) })
    }

    // ── Status ────────────────────────────────────────────────────────────────

    @PluginMethod
    fun getDeviceInfo(call: PluginCall) {
        call.resolve(JSObject().apply {
            put("model",   Build.MODEL)
            put("isSunmi", innerBound)
        })
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val btConnected = btSocket?.isConnected == true
        call.resolve(JSObject().apply {
            put("innerBound",         innerBound)
            put("bluetoothConnected", btConnected)
            put("connectedAddress",   btConnectedAddress ?: "")
            // Legacy fields kept for backward compatibility
            put("bound",      innerBound || btConnected)
            put("status",     if (innerBound) 0 else -1)
            put("statusText", if (innerBound) "SUNMI InnerPrinter พร้อม" else "ใช้เครื่องพิมพ์ Bluetooth")
        })
    }

    // ── Print ─────────────────────────────────────────────────────────────────

    @PluginMethod
    fun printHtml(call: PluginCall) {
        val html = call.getString("html")
        if (html.isNullOrEmpty()) {
            call.resolve(JSObject().apply { put("success", false); put("error", "No HTML provided") })
            return
        }
        val printerId = call.getString("printerId")
            ?: prefs.getString("default_printer_id", "") ?: ""
        if (printerId.isEmpty()) {
            call.resolve(JSObject().apply { put("success", false); put("error", "ยังไม่ได้เลือกเครื่องพิมพ์") })
            return
        }
        htmlToEscPosAndPrint(html, printerId, call)
    }

    @PluginMethod
    fun printTest(call: PluginCall) {
        val printerId = call.getString("printerId")
            ?: prefs.getString("default_printer_id", "") ?: ""
        if (printerId.isEmpty()) {
            call.resolve(JSObject().apply { put("success", false); put("error", "ยังไม่ได้เลือกเครื่องพิมพ์") })
            return
        }
        htmlToEscPosAndPrint(buildTestHtml(), printerId, call)
    }

    // ── Core: HTML → off-screen WebView → Bitmap → ESC/POS → printer ────────────
    //
    // Why this works:
    //   renderW = 384 × density  →  CSS viewport = renderW / density = 384 px
    //   HTML body is 384 CSS px wide  →  content fills the full CSS viewport.
    //   Physical bitmap = renderW × (contentHeight × density).
    //   Scale down: 384 × (contentHeight × density) / renderW = 384 × contentHeight.
    //   Each CSS px maps 1:1 to a bitmap px in the final 384-wide output.
    //
    // Why NOT viewport meta / useWideViewPort:
    //   initial-scale=1.0 in the meta forces view.scale = 1.0 (page-zoom factor).
    //   Then contentHeight × scale = CSS pixels, NOT physical pixels.
    //   The bitmap ends up 1/density of the correct height → tiny printed block.
    //
    // Why NOT MDPI createConfigurationContext:
    //   WebView still physically renders at the real screen density.
    //   Drawing 3× rendered content into a 384 px canvas compresses it to 1/3 size.

    private fun htmlToEscPosAndPrint(html: String, printerId: String, call: PluginCall) {
        val act = activity ?: run {
            call.resolve(JSObject().apply { put("success", false); put("error", "No activity") })
            return
        }

        act.runOnUiThread {
            try {
                val density = act.resources.displayMetrics.density
                val renderW = (384f * density).toInt()

                Log.d("PRINTER_DBG", "=== PRINT JOB START ===")
                Log.d("PRINTER_DBG", "printerId  : $printerId")
                Log.d("PRINTER_DBG", "density    : $density")
                Log.d("PRINTER_DBG", "renderW    : $renderW  (= 384 × density)")

                val wv = WebView(act)
                wv.settings.apply {
                    javaScriptEnabled = false
                    textZoom = 100
                }
                wv.setLayerType(View.LAYER_TYPE_SOFTWARE, null)

                val root = act.window.decorView.rootView as? android.view.ViewGroup
                root?.addView(wv, android.view.ViewGroup.LayoutParams(
                    renderW, android.view.ViewGroup.LayoutParams.WRAP_CONTENT))
                printWebView = wv

                wv.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String?) {
                        super.onPageFinished(view, url)
                        view.postDelayed({
                            try {
                                val cssH      = view.contentHeight
                                val viewScale = view.scale
                                val contentH  = (cssH * density).toInt().coerceAtLeast(100)

                                Log.d("PRINTER_DBG", "contentHeight (CSS px) : $cssH")
                                Log.d("PRINTER_DBG", "view.scale             : $viewScale")
                                Log.d("PRINTER_DBG", "contentH (phys px)     : $contentH  (= CSS × density)")

                                view.layout(0, 0, renderW, contentH)

                                val rawBmp = Bitmap.createBitmap(renderW, contentH, Bitmap.Config.ARGB_8888)
                                val canvas = Canvas(rawBmp)
                                canvas.drawColor(Color.WHITE)
                                view.draw(canvas)

                                Log.d("PRINTER_DBG", "rawBmp size            : ${rawBmp.width} × ${rawBmp.height}")

                                root?.removeView(wv)
                                printWebView = null

                                executor.submit {
                                    try {
                                        val targetH = (contentH.toFloat() / renderW * 384)
                                            .toInt().coerceAtLeast(10)
                                        val scaled = Bitmap.createScaledBitmap(rawBmp, 384, targetH, true)
                                        rawBmp.recycle()

                                        val scaledW = scaled.width
                                        val scaledH = scaled.height
                                        val bpr     = (scaledW + 7) / 8

                                        Log.d("PRINTER_DBG", "scaled size            : ${scaledW} × ${scaledH}")
                                        Log.d("PRINTER_DBG", "bytes per row (bpr)    : $bpr")

                                        // Hard assert — if this fires the scaling math is broken
                                        if (scaledW != 384) {
                                            scaled.recycle()
                                            throw Exception("ASSERT FAIL: bitmap width=$scaledW expected=384")
                                        }

                                        val bytes = bitmapToEscPosRaster(scaled)
                                        scaled.recycle()

                                        Log.d("PRINTER_DBG", "ESC/POS bytes total    : ${bytes.size}")
                                        Log.d("PRINTER_DBG", "=== DISPATCHING TO PRINTER ===")

                                        // Show bitmap info on screen so it's visible without logcat
                                        act.runOnUiThread {
                                            Toast.makeText(
                                                act,
                                                "PRINT DEBUG\nbmp: ${scaledW}×${scaledH}\nbpr=$bpr  bytes=${bytes.size}",
                                                Toast.LENGTH_LONG
                                            ).show()
                                        }

                                        dispatchToPrinter(printerId, bytes)

                                        act.runOnUiThread {
                                            call.resolve(JSObject().apply {
                                                put("success",       true)
                                                put("dbg_density",   density.toDouble())
                                                put("dbg_renderW",   renderW)
                                                put("dbg_cssH",      cssH)
                                                put("dbg_viewScale", viewScale.toDouble())
                                                put("dbg_contentH",  contentH)
                                                put("dbg_rawW",      renderW)
                                                put("dbg_rawH",      contentH)
                                                put("dbg_scaledW",   scaledW)
                                                put("dbg_scaledH",   scaledH)
                                                put("dbg_bpr",       bpr)
                                                put("dbg_bytes",     bytes.size)
                                            })
                                        }
                                    } catch (e: Exception) {
                                        Log.e("PRINTER_DBG", "SCALE/SEND ERROR: ${e.message}")
                                        act.runOnUiThread {
                                            call.resolve(JSObject().apply {
                                                put("success", false)
                                                put("error",   e.message ?: "Print failed")
                                            })
                                        }
                                    }
                                }

                            } catch (e: Exception) {
                                Log.e("PRINTER_DBG", "RENDER ERROR: ${e.message}")
                                root?.removeView(wv)
                                printWebView = null
                                call.resolve(JSObject().apply {
                                    put("success", false); put("error", e.message ?: "Render failed")
                                })
                            }
                        }, 800L)
                    }
                }

                wv.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)

            } catch (e: Exception) {
                Log.e("PRINTER_DBG", "SETUP ERROR: ${e.message}")
                call.resolve(JSObject().apply {
                    put("success", false); put("error", e.message ?: "Setup failed")
                })
            }
        }
    }

    private fun dispatchToPrinter(printerId: String, bytes: ByteArray) {
        when {
            printerId == "inner"             -> sendToInnerPrinter(bytes)
            printerId.startsWith("bt:")      -> sendToBluetooth(printerId.removePrefix("bt:"), bytes)
            else -> throw Exception("Unknown printer id: $printerId")
        }
    }

    // ── SUNMI inner printer via AIDL ──────────────────────────────────────────

    private fun sendToInnerPrinter(bytes: ByteArray) {
        val svc = woyouService
            ?: throw Exception("SUNMI InnerPrinter ไม่พร้อม — กรุณาตรวจสอบอุปกรณ์")
        svc.sendRAWData(bytes, null)
    }

    // ── Bluetooth socket (RFCOMM / SPP) ───────────────────────────────────────

    private fun sendToBluetooth(address: String, bytes: ByteArray) {
        // Reuse existing socket if connected to same device (avoids re-pairing overhead)
        if (btConnectedAddress == address && btSocket?.isConnected == true) {
            btOut!!.write(bytes)
            btOut!!.flush()
            return
        }

        // Close stale connection
        closeBluetooth()

        val adapter = getBluetoothAdapter()
            ?: throw Exception("Bluetooth ไม่พร้อมใช้งาน")

        @Suppress("MissingPermission")
        val device = adapter.getRemoteDevice(address)

        @Suppress("MissingPermission")
        val socket = device.createRfcommSocketToServiceRecord(SPP_UUID)

        // Stop discovery before connecting — improves connection speed & reliability
        @Suppress("MissingPermission")
        adapter.cancelDiscovery()

        socket.connect()   // blocks until connected or throws

        btSocket = socket
        btOut    = socket.outputStream
        btConnectedAddress = address

        btOut!!.write(bytes)
        btOut!!.flush()
    }

    // ── ESC/POS raster bitmap conversion ──────────────────────────────────────
    //
    // Command: GS v 0  (0x1D 0x76 0x30) — Print Raster Bit Image
    // Width fixed at 384 dots (58mm paper @ 203dpi). Thai characters render via
    // WebView so no code-page conversion is needed.

    private fun bitmapToEscPosRaster(bmp: Bitmap): ByteArray {
        val w   = bmp.width    // 384
        val h   = bmp.height
        val bpr = (w + 7) / 8  // bytes per row = 48 for 384-wide image

        val out = ByteArrayOutputStream()

        // ESC @ — initialize printer, clear buffer
        out.write(byteArrayOf(ESC, 0x40.toByte()))

        // ESC 3 0 — set line spacing to 0 (no gaps between raster rows)
        out.write(byteArrayOf(ESC, 0x33.toByte(), 0.toByte()))

        // GS v 0 m xL xH yL yH — raster bit image header
        out.write(byteArrayOf(
            GS, 0x76.toByte(), 0x30.toByte(), 0x00.toByte(),      // command + m=0 (normal density)
            (bpr and 0xFF).toByte(), (bpr ushr 8 and 0xFF).toByte(),   // xL xH: byte width of image
            (h   and 0xFF).toByte(), (h   ushr 8 and 0xFF).toByte(),   // yL yH: dot rows (height)
        ))

        // Image data: 1 bit per pixel, MSB first (bit 7 = leftmost pixel)
        val row = IntArray(w)
        for (y in 0 until h) {
            bmp.getPixels(row, 0, w, 0, y, w, 1)
            val rowBytes = ByteArray(bpr)
            for (x in 0 until w) {
                val px  = row[x]
                // Standard luminance formula; below 128 = dark = print dot
                val lum = (0.299 * ((px shr 16) and 0xFF) +
                           0.587 * ((px shr  8) and 0xFF) +
                           0.114 * ( px         and 0xFF)).toInt()
                if (lum < 128) {
                    rowBytes[x / 8] = (rowBytes[x / 8].toInt() or (0x80 ushr (x % 8))).toByte()
                }
            }
            out.write(rowBytes)
        }

        // Restore default line spacing, feed paper, partial cut
        out.write(byteArrayOf(ESC, 0x33.toByte(), 24.toByte()))            // ESC 3 24 — default spacing
        out.write(byteArrayOf(ESC, 0x64.toByte(), 5.toByte()))             // ESC d 5  — feed 5 lines
        out.write(byteArrayOf(GS, 0x56.toByte(), 0x42.toByte(), 0x00.toByte()))  // GS V B 0 — partial cut

        return out.toByteArray()
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun getBluetoothAdapter(): BluetoothAdapter? = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
        } else {
            @Suppress("DEPRECATION")
            BluetoothAdapter.getDefaultAdapter()
        }
    } catch (_: Exception) { null }

    private fun buildTestHtml(): String = """<!DOCTYPE html>
<html lang="th"><head>
<meta charset="utf-8">
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 24px; line-height: 1.4;
         width: 384px; padding: 8px 12px 16px 12px; color: #000; background: #fff; }
  .c  { text-align: center; }
  .b  { font-weight: bold; }
  .xl { font-size: 34px; font-weight: bold; }
  .lg { font-size: 28px; font-weight: bold; }
  .xs { font-size: 18px; }
  .hr { border: none; border-top: 2px dashed #000; margin: 8px 0; }
  /* Full-width solid black block — diagnostic: if this prints narrow, bitmap is wrong */
  .blk { width: 100%; height: 40px; background: #000; margin: 8px 0; display: block; }
</style></head><body>
<p class="c xl">FixITPro POS</p>
<div class="hr"></div>
<p class="c lg">ทดสอบเครื่องพิมพ์</p>
<p class="c xs">${Build.MODEL} · Android ${Build.VERSION.RELEASE}</p>
<div class="hr"></div>
<!-- DIAGNOSTIC: full-width black bar. Must print edge-to-edge across 58mm paper. -->
<!-- If narrow → bitmap width is wrong. If full-width → CSS rendering is wrong. -->
<div class="blk"></div>
<p class="c xs">ถ้าแถบดำด้านบนพิมพ์เต็มความกว้าง = bitmap ถูกต้อง</p>
<p class="c xs">ถ้าแถบดำแคบ = bitmap width ผิด</p>
<div class="hr"></div>
<p class="c xs">ขอบคุณที่ใช้บริการ FixITPro</p>
<br><br>
</body></html>"""

    // ── Legacy stubs (keep for API backward compat) ───────────────────────────

    @PluginMethod fun printReceipt(call: PluginCall) {
        call.resolve(JSObject().apply { put("success", false); put("error", "Use printHtml") })
    }
    @PluginMethod fun printLines(call: PluginCall) {
        call.resolve(JSObject().apply { put("success", false); put("error", "Use printHtml") })
    }
    @PluginMethod fun feedPaper(call: PluginCall) {
        call.resolve(JSObject().apply { put("success", false) })
    }
    @PluginMethod fun cutPaper(call: PluginCall) {
        call.resolve(JSObject().apply { put("success", false) })
    }
    @PluginMethod fun openCashDrawer(call: PluginCall) {
        call.resolve(JSObject().apply { put("success", false) })
    }
}

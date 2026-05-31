package com.fixitpro.pos.plugins

import android.app.Activity
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.journeyapps.barcodescanner.ScanIntentResult
import com.journeyapps.barcodescanner.ScanOptions

/**
 * Native barcode scanner using ZXing embedded.
 * Opens a full-screen camera scanner activity; returns scanned code to JS.
 * No external app required — ZXing is bundled in the APK.
 */
@CapacitorPlugin(name = "BarcodeScanner")
class BarcodeScannerPlugin : Plugin() {

    @PluginMethod
    fun scan(call: PluginCall) {
        val options = ScanOptions()
            .setDesiredBarcodeFormats(ScanOptions.ALL_CODE_TYPES)
            .setPrompt("สแกนบาร์โค้ด")
            .setBeepEnabled(true)
            .setBarcodeImageEnabled(false)
            .setOrientationLocked(false)
        val intent = options.createScanIntent(context)
        startActivityForResult(call, intent, "handleScanResult")
    }

    @ActivityCallback
    private fun handleScanResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val ret = JSObject()
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val scanned = ScanIntentResult.parseActivityResult(result.resultCode, result.data!!)
            val contents = scanned?.contents
            ret.put("value", contents ?: "")
            ret.put("cancelled", contents == null)
        } else {
            ret.put("value", "")
            ret.put("cancelled", true)
        }
        call.resolve(ret)
    }
}

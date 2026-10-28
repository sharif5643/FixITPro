package com.fixitpro.pos.plugins

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Fingerprint / face unlock for the staff app's lock screen. Only says whether the phone's owner
 * was recognised; the app's PIN (checked on the server) is always there as the fallback.
 */
@CapacitorPlugin(name = "AppBiometric")
class BiometricPlugin : Plugin() {

    // Face unlock on most Android phones counts as "weak"; the phone's own pattern / PIN is not offered
    private val authenticators = BiometricManager.Authenticators.BIOMETRIC_WEAK

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val result = BiometricManager.from(context).canAuthenticate(authenticators)
        val ret = JSObject()
        ret.put("available", result == BiometricManager.BIOMETRIC_SUCCESS)
        // Has the hardware but nothing enrolled yet (no fingerprint / face saved on the phone)
        ret.put("enrolled", result != BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED)
        call.resolve(ret)
    }

    @PluginMethod
    fun authenticate(call: PluginCall) {
        val host = activity as? FragmentActivity
        if (host == null) {
            call.resolve(JSObject().put("success", false).put("cancelled", false).put("error", "unavailable"))
            return
        }
        val title = call.getString("title") ?: "ปลดล็อก FixITPro"
        val subtitle = call.getString("subtitle")
        val cancel = call.getString("cancel") ?: "ใช้ PIN"
        host.runOnUiThread {
            var done = false
            val prompt = BiometricPrompt(host, ContextCompat.getMainExecutor(context),
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        if (done) return
                        done = true
                        call.resolve(JSObject().put("success", true))
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        if (done) return
                        done = true
                        val cancelled = errorCode == BiometricPrompt.ERROR_USER_CANCELED ||
                            errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
                            errorCode == BiometricPrompt.ERROR_CANCELED
                        call.resolve(JSObject().put("success", false).put("cancelled", cancelled).put("error", errString.toString()))
                    }
                    // A finger / face not recognised: the prompt stays open for another try
                })
            val info = BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .apply { if (subtitle != null) setSubtitle(subtitle) }
                .setNegativeButtonText(cancel)
                .setAllowedAuthenticators(authenticators)
                .build()
            prompt.authenticate(info)
        }
    }
}

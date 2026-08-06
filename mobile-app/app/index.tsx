import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Alert,
  BackHandler, StyleSheet, ActivityIndicator, Linking,
} from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import { captureRef } from 'react-native-view-shot';
import {
  getPairedDevices, getSavedPrinterAddress, savePrinterAddress,
  printText, printBuffer, formatReceiptText, formatRepairIntakeText,
  requestBluetoothPermissions,
} from '@/lib/bluetooth-print';
import { pngBase64ToEscPosJob } from '@/lib/png-to-escpos';

const STAFF_URL = 'https://fixitpro.in.th/staff';

// Intercept window.open so the web receipt preview (PrinterFlowSheet) routes through
// React Native Bluetooth instead of opening a browser popup that can't reach the printer.
const WINDOW_OPEN_INTERCEPT = `
(function() {
  var _orig = window.open.bind(window);
  window.open = function(url, target, features) {
    if (window.__FIXITPRO_NATIVE__ && (!url || url === '' || url === 'about:blank')) {
      var html = '';
      return {
        document: {
          write: function(s) { html += s; },
          close: function() {
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
              JSON.stringify({ type: 'PRINT_HTML', html: html })
            );
          }
        },
        focus: function() {},
        print: function() {},
        close: function() {},
        location: { href: 'about:blank' }
      };
    }
    return _orig(url, target, features);
  };
})();
`;

export default function App() {
  const webRef         = useRef<WebView>(null);
  const hiddenWebRef    = useRef<View>(null);
  const loadTimer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPrint    = useRef<{ addr: string; copies: number } | null>(null);
  const captureStarted  = useRef(false);

  const [loading,     setLoading]     = useState(true);
  const [offline,     setOffline]     = useState(false);
  const [printing,    setPrinting]    = useState(false);
  const [printerName, setPrinterName] = useState<string | null>(null);
  const [printHtml,   setPrintHtml]   = useState<string | null>(null);

  const stopLoading = useCallback(() => {
    if (loadTimer.current) clearTimeout(loadTimer.current);
    setLoading(false);
  }, []);

  const startLoading = useCallback(() => {
    setLoading(true);
    if (loadTimer.current) clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(() => setLoading(false), 12000);
  }, []);

  useEffect(() => () => { if (loadTimer.current) clearTimeout(loadTimer.current); }, []);

  useEffect(() => { requestBluetoothPermissions().catch(() => {}); }, []);

  useEffect(() => {
    getSavedPrinterAddress().then((addr) => { if (addr) setPrinterName(addr); });
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      webRef.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, []);

  // ── Message handler ───────────────────────────────────────────────────────────

  async function onMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'PRINT_HTML') {
        await handlePrintHtml(msg);
      } else if (msg.type === 'PRINT_RECEIPT') {
        if (msg.opts?.ticketNumber) {
          await handlePrintRepair(msg);
        } else {
          await handlePrintReceipt(msg);
        }
      } else if (msg.type === 'PRINT_REPAIR') {
        await handlePrintRepair(msg);
      } else if (msg.type === 'SELECT_PRINTER') {
        await handleSelectPrinter();
      }
    } catch (err) {
      console.warn('[WebView Bridge]', err);
    }
  }

  // ── HTML → bitmap → Bluetooth (mirrors the web receipt 1:1) ─────────────────

  async function handlePrintHtml(msg: { html: string }) {
    const addr = await getOrSelectPrinter();
    if (!addr) return;
    // 2 copies for repair intakes (customer copy + shop copy)
    const copies = msg.html.includes('ใบรับซ่อม') ? 2 : 1;
    pendingPrint.current = { addr, copies };
    setPrintHtml(msg.html);
  }

  // Shared capture-and-print logic — called either when all images signal ready
  // (via __PRINT_READY__ message) or after a generous fallback timeout.
  async function doCaptureAndPrint() {
    const pending = pendingPrint.current;
    pendingPrint.current = null;
    if (!pending || !hiddenWebRef.current) { setPrintHtml(null); return; }

    setPrinting(true);
    try {
      const base64 = await captureRef(hiddenWebRef, {
        format: 'png', quality: 1, result: 'base64',
      }) as string;
      const job = pngBase64ToEscPosJob(base64, pending.copies);
      await printBuffer(pending.addr, job);
    } catch (err: any) {
      Alert.alert('พิมพ์ไม่สำเร็จ', err?.message ?? 'กรุณาตรวจสอบเครื่องพิมพ์');
    } finally {
      setPrinting(false);
      setPrintHtml(null);
      captureStarted.current = false;
    }
  }

  // Triggered by injectedJavaScript inside the hidden WebView once all <img> finish.
  async function onHiddenWebViewMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === '__PRINT_READY__' && !captureStarted.current) {
        captureStarted.current = true;
        await doCaptureAndPrint();
      }
    } catch { /* ignore */ }
  }

  // Fallback: if the __PRINT_READY__ message never arrives (e.g. network timeout),
  // capture after 4 s from onLoadEnd so we still print (QR may be missing but rest is ok).
  async function onHiddenWebViewLoad() {
    await new Promise<void>((r) => setTimeout(r, 4000));
    if (!captureStarted.current && pendingPrint.current) {
      captureStarted.current = true;
      await doCaptureAndPrint();
    }
  }

  // ── Shared helper: get/select printer ────────────────────────────────────────

  async function getOrSelectPrinter(): Promise<string | null> {
    const saved = await getSavedPrinterAddress();
    if (saved) return saved;
    const ok = await askSelectPrinter();
    if (!ok) return null;
    return getSavedPrinterAddress();
  }

  // ── Receipt print (sale / POS) ────────────────────────────────────────────────

  async function handlePrintReceipt(msg: any) {
    const addr = await getOrSelectPrinter();
    if (!addr) return;
    setPrinting(true);
    try {
      const text = msg.text ?? formatReceiptText(msg.opts);
      await printText(addr, text);
    } catch (err: any) {
      Alert.alert('พิมพ์ไม่สำเร็จ', err?.message ?? 'กรุณาตรวจสอบเครื่องพิมพ์');
    } finally {
      setPrinting(false);
    }
  }

  // ── Repair intake print ───────────────────────────────────────────────────────

  async function handlePrintRepair(msg: any) {
    const addr = await getOrSelectPrinter();
    if (!addr) return;
    setPrinting(true);
    try {
      const text = msg.text ?? formatRepairIntakeText(msg.opts);
      await printText(addr, text);
    } catch (err: any) {
      Alert.alert('พิมพ์ไม่สำเร็จ', err?.message ?? 'กรุณาตรวจสอบเครื่องพิมพ์');
    } finally {
      setPrinting(false);
    }
  }

  // ── Printer selection dialog ──────────────────────────────────────────────────

  async function handleSelectPrinter() {
    await askSelectPrinter();
  }

  async function askSelectPrinter(): Promise<boolean> {
    try {
      const devices = await getPairedDevices();
      if (!devices.length) {
        Alert.alert(
          'ไม่พบเครื่องพิมพ์',
          'กรุณา pair เครื่องพิมพ์ Bluetooth ในการตั้งค่า Android ก่อน แล้วกลับมาลองใหม่',
        );
        return false;
      }
      return new Promise((resolve) => {
        Alert.alert(
          'เลือกเครื่องพิมพ์',
          'เลือกเครื่องพิมพ์ Bluetooth ที่ต้องการใช้',
          [
            ...devices.map((d) => ({
              text: d.name,
              onPress: async () => {
                await savePrinterAddress(d.address);
                setPrinterName(d.name);
                webRef.current?.injectJavaScript(
                  `window.dispatchEvent(new CustomEvent('fixitpro-printer', { detail: { name: ${JSON.stringify(d.name)} } })); true;`,
                );
                resolve(true);
              },
            })),
            { text: 'ยกเลิก', style: 'cancel', onPress: () => resolve(false) },
          ],
        );
      });
    } catch {
      Alert.alert('ข้อผิดพลาด', 'ไม่สามารถดึงรายการอุปกรณ์ได้ กรุณาตรวจสอบสิทธิ์ Bluetooth');
      return false;
    }
  }

  // ── Offline screen ────────────────────────────────────────────────────────────

  if (offline) {
    return (
      <View style={s.center}>
        <Text style={s.offlineTitle}>ไม่มีการเชื่อมต่อ</Text>
        <Text style={s.offlineSub}>กรุณาตรวจสอบ WiFi หรือเน็ต</Text>
        <TouchableOpacity
          style={s.retryBtn}
          onPress={() => { setOffline(false); webRef.current?.reload(); }}
        >
          <Text style={s.retryText}>ลองใหม่</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1 }}>
      <WebView
        ref={webRef}
        source={{ uri: STAFF_URL }}
        style={{ flex: 1 }}
        onMessage={onMessage}
        onLoadStart={startLoading}
        onLoadEnd={stopLoading}
        onNavigationStateChange={(state) => { if (!state.loading) stopLoading(); }}
        onError={() => { stopLoading(); setOffline(true); }}
        onHttpError={(e) => {
          stopLoading();
          if (e.nativeEvent.statusCode >= 500) setOffline(true);
        }}
        onOpenWindow={(e) => {
          const url = e.nativeEvent.targetUrl;
          webRef.current?.injectJavaScript(
            `window.location.href = ${JSON.stringify(url)}; true;`,
          );
        }}
        onShouldStartLoadWithRequest={(req) => {
          const url = req.url;
          if (url.startsWith('tel:') || url.startsWith('mailto:') || url.startsWith('line:')) {
            Linking.openURL(url).catch(() => {});
            return false;
          }
          if (url.startsWith('https://') && !url.includes('fixitpro.in.th')) {
            Linking.openURL(url).catch(() => {});
            return false;
          }
          return true;
        }}
        onPermissionRequest={(e) => e.nativeEvent.grant(e.nativeEvent.resources)}
        allowsInlineMediaPlayback
        mediaCapturePermissionGrantType="grant"
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        injectedJavaScriptBeforeContentLoaded={`
          window.__FIXITPRO_NATIVE__ = true;
          window.__FIXITPRO_PRINTER__ = ${JSON.stringify(printerName ?? '')};
          ${WINDOW_OPEN_INTERCEPT}
          true;
        `}
      />

      {/* Off-screen WebView renders the receipt HTML as a bitmap for Bluetooth printing.
          androidLayerType="software" lets react-native-view-shot capture it.
          injectedJavaScript waits for all <img> to load before sending __PRINT_READY__
          so the QR code (fetched from api.qrserver.com) is fully rendered before screenshot. */}
      {printHtml !== null && (
        <View
          ref={hiddenWebRef}
          collapsable={false}
          style={s.hiddenPrint}
        >
          <WebView
            source={{ html: printHtml }}
            style={{ width: 384, height: 2000, backgroundColor: '#fff' }}
            androidLayerType="software"
            scrollEnabled={false}
            javaScriptEnabled
            onMessage={onHiddenWebViewMessage}
            onLoadEnd={onHiddenWebViewLoad}
            injectedJavaScript={`
              (function() {
                var imgs = document.querySelectorAll('img');
                var remaining = imgs.length;
                function done() {
                  if (--remaining <= 0) {
                    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
                      JSON.stringify({ type: '__PRINT_READY__' })
                    );
                  }
                }
                if (remaining === 0) {
                  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
                    JSON.stringify({ type: '__PRINT_READY__' })
                  );
                } else {
                  imgs.forEach(function(img) {
                    if (img.complete) { done(); } else {
                      img.addEventListener('load', done);
                      img.addEventListener('error', done);
                    }
                  });
                }
              })();
              true;
            `}
          />
        </View>
      )}

      {loading && (
        <View style={[StyleSheet.absoluteFill, s.loadingOverlay]}>
          <ActivityIndicator size="large" color="#1D4ED8" />
        </View>
      )}

      {printing && (
        <View style={[StyleSheet.absoluteFill, s.printingOverlay]}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={s.printingText}>กำลังพิมพ์…</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FB', gap: 8 },
  offlineTitle:    { fontSize: 18, fontWeight: '700', color: '#111' },
  offlineSub:      { fontSize: 13, color: '#94A3B8' },
  retryBtn:        { marginTop: 12, backgroundColor: '#1D4ED8', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  retryText:       { color: '#fff', fontWeight: '700', fontSize: 14 },
  loadingOverlay:  { backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  printingOverlay: { backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  printingText:    { color: '#fff', fontSize: 15, fontWeight: '600' },
  hiddenPrint:     { position: 'absolute', left: -800, top: 0, width: 384, height: 2000 },
});

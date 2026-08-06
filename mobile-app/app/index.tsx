import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Alert,
  BackHandler, StyleSheet, ActivityIndicator, Linking,
} from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import {
  getPairedDevices, getSavedPrinterAddress, savePrinterAddress,
  printText, formatReceiptText, formatRepairIntakeText,
  requestBluetoothPermissions,
} from '@/lib/bluetooth-print';

const STAFF_URL = 'https://fixitpro.in.th/staff';

export default function App() {
  const webRef      = useRef<WebView>(null);
  const loadTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [offline,     setOffline]     = useState(false);
  const [printing,    setPrinting]    = useState(false);
  const [printerName, setPrinterName] = useState<string | null>(null);

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

  // Request Bluetooth permissions on startup (required Android 12+)
  useEffect(() => {
    requestBluetoothPermissions().catch(() => {});
  }, []);

  // Load saved printer name on start
  useEffect(() => {
    getSavedPrinterAddress().then((addr) => {
      if (addr) setPrinterName(addr);
    });
  }, []);

  // Android hardware back button → navigate back in WebView
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
      if (msg.type === 'PRINT_RECEIPT') {
        // Detect repair intake by presence of ticketNumber field
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

  // ── Shared print helper: get/select printer ───────────────────────────────────

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
          true;
        `}
      />

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
});

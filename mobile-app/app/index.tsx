import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Alert,
  BackHandler, StyleSheet, ActivityIndicator,
} from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import {
  getPairedDevices, getSavedPrinterAddress,
  savePrinterAddress, printText, formatReceiptText,
} from '@/lib/bluetooth-print';

const STAFF_URL = 'https://fixitpro.in.th/staff';

export default function App() {
  const webRef  = useRef<WebView>(null);
  const [loading,      setLoading]      = useState(true);
  const [offline,      setOffline]      = useState(false);
  const [printing,     setPrinting]     = useState(false);
  const [printerName,  setPrinterName]  = useState<string | null>(null);

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

  // Handle messages from the web page
  async function onMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);

      if (msg.type === 'PRINT_RECEIPT') {
        await handlePrint(msg);
      } else if (msg.type === 'SELECT_PRINTER') {
        await handleSelectPrinter();
      }
    } catch (err) {
      console.warn('[WebView Bridge]', err);
    }
  }

  async function handlePrint(msg: any) {
    const address = await getSavedPrinterAddress();
    if (!address) {
      const ok = await askSelectPrinter();
      if (!ok) return;
    }
    const addr = await getSavedPrinterAddress();
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

  async function handleSelectPrinter() {
    await askSelectPrinter();
  }

  async function askSelectPrinter(): Promise<boolean> {
    try {
      const devices = await getPairedDevices();
      if (!devices.length) {
        Alert.alert('ไม่พบเครื่องพิมพ์', 'กรุณา pair เครื่องพิมพ์ Bluetooth ในการตั้งค่า Android ก่อน');
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
                // Notify web page printer is connected
                webRef.current?.injectJavaScript(
                  `window.dispatchEvent(new CustomEvent('fixitpro-printer', { detail: { name: ${JSON.stringify(d.name)} } })); true;`
                );
                resolve(true);
              },
            })),
            { text: 'ยกเลิก', style: 'cancel', onPress: () => resolve(false) },
          ],
        );
      });
    } catch {
      Alert.alert('ข้อผิดพลาด', 'ไม่สามารถดึงรายการอุปกรณ์ได้');
      return false;
    }
  }

  if (offline) {
    return (
      <View style={s.center}>
        <Text style={s.offlineTitle}>ไม่มีการเชื่อมต่อ</Text>
        <Text style={s.offlineSub}>กรุณาตรวจสอบ WiFi หรือเน็ต</Text>
        <TouchableOpacity style={s.retryBtn} onPress={() => { setOffline(false); webRef.current?.reload(); }}>
          <Text style={s.retryText}>ลองใหม่</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <WebView
        ref={webRef}
        source={{ uri: STAFF_URL }}
        style={{ flex: 1 }}
        onMessage={onMessage}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => setOffline(true)}
        onHttpError={(e) => {
          if (e.nativeEvent.statusCode >= 500) setOffline(true);
        }}
        // Allow camera for barcode scanning
        onPermissionRequest={(e) => e.nativeEvent.grant(e.nativeEvent.resources)}
        // File upload from camera
        allowsInlineMediaPlayback
        mediaCapturePermissionGrantType="grant"
        javaScriptEnabled
        domStorageEnabled
        // Allow file chooser (photo upload)
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        // Inject helper so web can detect it's inside native app
        injectedJavaScriptBeforeContentLoaded={`
          window.__FIXITPRO_NATIVE__ = true;
          window.__FIXITPRO_PRINTER__ = ${JSON.stringify(printerName ?? '')};
          true;
        `}
      />

      {/* Loading overlay */}
      {loading && (
        <View style={[StyleSheet.absoluteFill, s.loadingOverlay]}>
          <ActivityIndicator size="large" color="#1D4ED8" />
        </View>
      )}

      {/* Printing overlay */}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FB', gap: 8 },
  offlineTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  offlineSub:   { fontSize: 13, color: '#94A3B8' },
  retryBtn:     { marginTop: 12, backgroundColor: '#1D4ED8', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  retryText:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  loadingOverlay:  { backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  printingOverlay: { backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  printingText:    { color: '#fff', fontSize: 15, fontWeight: '600' },
});

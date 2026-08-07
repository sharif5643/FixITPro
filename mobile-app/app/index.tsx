import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Alert, Modal, ScrollView,
  BackHandler, StyleSheet, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import { captureRef } from 'react-native-view-shot';
import {
  getPairedDevices, getSavedPrinterAddress, savePrinterAddress,
  printText, printBuffer, formatReceiptText,
  requestBluetoothPermissions,
} from '@/lib/bluetooth-print';
import { pngBase64ToEscPosJob } from '@/lib/png-to-escpos';
import { buildRepairIntakeHtml } from '@/lib/receipt-html';

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
        addEventListener: function() {},
        removeEventListener: function() {},
        location: { href: 'about:blank' }
      };
    }
    return _orig(url, target, features);
  };
})();
`;

type Device = { name: string; address: string };
type PrintJob = { html: string; ticketNumber?: string };

export default function App() {
  const insets        = useSafeAreaInsets();
  const webRef        = useRef<WebView>(null);
  const hiddenWebRef  = useRef<View>(null);
  const loadTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPrint  = useRef<{ addr: string; copies: number } | null>(null);
  const captureStarted = useRef(false);
  const pendingJob    = useRef<PrintJob | null>(null);
  const selectedCopies = useRef(2);

  const [loading,          setLoading]          = useState(true);
  const [offline,          setOffline]          = useState(false);
  const [printing,         setPrinting]         = useState(false);
  const [printerName,      setPrinterName]      = useState<string | null>(null);
  const [printHtml,        setPrintHtml]        = useState<string | null>(null);
  const [showPrintSheet,   setShowPrintSheet]   = useState(false);
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [deviceList,       setDeviceList]       = useState<Device[]>([]);

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
      if (showPrinterModal) { setShowPrinterModal(false); return true; }
      if (showPrintSheet)   { setShowPrintSheet(false);   return true; }
      webRef.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, [showPrinterModal, showPrintSheet]);

  // ── WebView message handler ───────────────────────────────────────────────────

  async function onMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'PRINT_HTML') {
        // Web's PrinterFlowSheet already showed print options — print received HTML directly
        pendingJob.current = { html: msg.html };
        selectedCopies.current = 1;
        const addr = await getSavedPrinterAddress();
        if (!addr) { await openPrinterModal(); return; }
        startBitmapPrint(addr, 1);
      } else if (msg.type === 'PRINT_RECEIPT') {
        if (msg.opts?.ticketNumber) {
          const html = buildRepairIntakeHtml(msg.opts);
          showPrintOptions(html, msg.opts.ticketNumber);
        } else {
          await handlePrintReceipt(msg);
        }
      } else if (msg.type === 'PRINT_REPAIR') {
        if (msg.opts) {
          const html = buildRepairIntakeHtml(msg.opts);
          showPrintOptions(html, msg.opts.ticketNumber);
        } else if (msg.text) {
          await printTextDirect(msg.text);
        }
      } else if (msg.type === 'SELECT_PRINTER') {
        await openPrinterModal();
      }
    } catch (err) {
      console.warn('[WebView Bridge]', err);
    }
  }

  // ── Print options sheet ───────────────────────────────────────────────────────

  function showPrintOptions(html: string, ticketNumber?: string) {
    if (!ticketNumber) {
      // Try to extract from HTML title
      const m = html.match(/ใบรับซ่อม\s+([\w-]+)/)
        || html.match(/#(REP-[\w-]+)/)
      if (m) ticketNumber = m[1];
    }
    pendingJob.current = { html, ticketNumber };
    setShowPrintSheet(true);
  }

  async function executePrint(copies: number) {
    setShowPrintSheet(false);
    selectedCopies.current = copies;
    const addr = await getSavedPrinterAddress();
    if (!addr) { await openPrinterModal(); return; }
    startBitmapPrint(addr, copies);
  }

  function startBitmapPrint(addr: string, copies: number) {
    const job = pendingJob.current;
    if (!job) return;
    captureStarted.current = false;
    pendingPrint.current   = { addr, copies };
    setPrintHtml(job.html);
  }

  async function handleA4Print() {
    setShowPrintSheet(false);
    const ticket = pendingJob.current?.ticketNumber;
    if (ticket) {
      Linking.openURL(`https://fixitpro.in.th/print/repair/${ticket}`);
    } else {
      Alert.alert('A4', 'ไม่พบหมายเลขใบงาน กรุณาพิมพ์จากเว็บโดยตรง');
    }
  }

  // ── Printer selection modal ───────────────────────────────────────────────────

  async function openPrinterModal() {
    try {
      const devices = await getPairedDevices();
      setDeviceList(devices);
      setShowPrinterModal(true);
    } catch {
      Alert.alert('ข้อผิดพลาด', 'ไม่สามารถดึงรายการอุปกรณ์ได้ กรุณาตรวจสอบสิทธิ์ Bluetooth');
    }
  }

  async function onPrinterSelected(address: string, name: string) {
    await savePrinterAddress(address);
    setPrinterName(name);
    webRef.current?.injectJavaScript(
      `window.dispatchEvent(new CustomEvent('fixitpro-printer', { detail: { name: ${JSON.stringify(name)} } })); true;`,
    );
    setShowPrinterModal(false);
    if (pendingJob.current) {
      startBitmapPrint(address, selectedCopies.current);
    }
  }

  // ── Bitmap capture → Bluetooth pipeline ──────────────────────────────────────

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

  async function onHiddenWebViewMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === '__PRINT_READY__' && !captureStarted.current) {
        captureStarted.current = true;
        await doCaptureAndPrint();
      }
    } catch { /* ignore */ }
  }

  async function onHiddenWebViewLoad() {
    await new Promise<void>((r) => setTimeout(r, 4000));
    if (!captureStarted.current && pendingPrint.current) {
      captureStarted.current = true;
      await doCaptureAndPrint();
    }
  }

  // ── Sale receipt (POS / text) print ──────────────────────────────────────────

  async function handlePrintReceipt(msg: any) {
    const addr = await getSavedPrinterAddress();
    if (!addr) { await openPrinterModal(); return; }
    await printTextDirect(msg.text ?? formatReceiptText(msg.opts));
  }

  async function printTextDirect(text: string) {
    const addr = await getSavedPrinterAddress();
    if (!addr) { await openPrinterModal(); return; }
    setPrinting(true);
    try { await printText(addr, text); }
    catch (err: any) { Alert.alert('พิมพ์ไม่สำเร็จ', err?.message ?? 'กรุณาตรวจสอบเครื่องพิมพ์'); }
    finally { setPrinting(false); }
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
    <View style={{ flex: 1, paddingBottom: insets.bottom }}>

      {/* ── Main WebView ─────────────────────────────────────────────────────── */}
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
          // Only navigate for real URLs; blank popups are handled by WINDOW_OPEN_INTERCEPT
          if (url && url !== '' && url !== 'about:blank') {
            webRef.current?.injectJavaScript(
              `window.location.href = ${JSON.stringify(url)}; true;`,
            );
          }
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

      {/* ── Hidden WebView: renders receipt HTML for bitmap capture ──────────── */}
      {printHtml !== null && (
        <View ref={hiddenWebRef} collapsable={false} style={s.hiddenPrint}>
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

      {/* ── Loading overlay ──────────────────────────────────────────────────── */}
      {loading && (
        <View style={[StyleSheet.absoluteFill, s.loadingOverlay]}>
          <ActivityIndicator size="large" color="#1D4ED8" />
        </View>
      )}

      {/* ── Printing overlay ─────────────────────────────────────────────────── */}
      {printing && (
        <View style={[StyleSheet.absoluteFill, s.printingOverlay]}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={s.printingText}>กำลังพิมพ์…</Text>
        </View>
      )}

      {/* ── Native Print Options Sheet ────────────────────────────────────────── */}
      <Modal
        visible={showPrintSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPrintSheet(false)}
      >
        <View style={s.sheetOverlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>พิมพ์ใบรับงานซ่อม</Text>

            {/* ใบร้าน | ใบลูกค้า */}
            <View style={s.row2}>
              <TouchableOpacity style={s.outlineBtn} onPress={() => executePrint(1)}>
                <Text style={s.outlineBtnIcon}>🖨</Text>
                <Text style={s.outlineBtnText}>ใบร้าน</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.outlineBtn} onPress={() => executePrint(1)}>
                <Text style={s.outlineBtnIcon}>🖨</Text>
                <Text style={s.outlineBtnText}>ใบลูกค้า</Text>
              </TouchableOpacity>
            </View>

            {/* Main: 2 copies */}
            <TouchableOpacity style={s.primaryBtn} onPress={() => executePrint(2)}>
              <Text style={s.primaryBtnText}>🖨  พิมพ์ 2 ฉบับ (ร้าน + ลูกค้า)  ✂</Text>
            </TouchableOpacity>

            {/* A4 */}
            <TouchableOpacity style={s.a4Btn} onPress={handleA4Print}>
              <Text style={s.a4BtnText}>📄  A4 (เอกสาร)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.closeSheetBtn} onPress={() => setShowPrintSheet(false)}>
              <Text style={s.closeSheetBtnText}>ปิด</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Printer Selection Modal ───────────────────────────────────────────── */}
      <Modal
        visible={showPrinterModal}
        animationType="slide"
        onRequestClose={() => setShowPrinterModal(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FB' }}>
          <View style={s.printerHeader}>
            <Text style={s.printerHeaderTitle}>Connect Printer</Text>
            <TouchableOpacity onPress={() => setShowPrinterModal(false)} style={s.closeXBtn}>
              <Text style={s.closeX}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }}>
            {deviceList.length === 0 ? (
              <View style={s.noDevices}>
                <Text style={s.noDevicesText}>ไม่พบอุปกรณ์ Bluetooth</Text>
                <Text style={s.noDevicesSub}>
                  กรุณา pair เครื่องพิมพ์ในการตั้งค่า Android ก่อน แล้วกดรีเฟรช
                </Text>
              </View>
            ) : deviceList.map((d) => (
              <TouchableOpacity
                key={d.address}
                style={s.deviceRow}
                onPress={() => onPrinterSelected(d.address, d.name)}
              >
                <View style={s.btIconBg}>
                  <Text style={s.btIconText}>⚡</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={s.deviceName}>{d.name}</Text>
                  <Text style={s.deviceAddr}>{d.address}</Text>
                </View>
                <View style={s.pairedBadge}>
                  <Text style={s.pairedText}>Paired</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={s.printerFooter}>
            <TouchableOpacity style={s.refreshBtn} onPress={openPrinterModal}>
              <Text style={s.refreshBtnText}>⚙  รีเฟรชรายการ</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

    </View>
  );
}

const s = StyleSheet.create({
  // ── App base ─────────────────────────────────────────────────────────────────
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FB', gap: 8 },
  offlineTitle:    { fontSize: 18, fontWeight: '700', color: '#111' },
  offlineSub:      { fontSize: 13, color: '#94A3B8' },
  retryBtn:        { marginTop: 12, backgroundColor: '#1D4ED8', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  retryText:       { color: '#fff', fontWeight: '700', fontSize: 14 },
  loadingOverlay:  { backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  printingOverlay: { backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  printingText:    { color: '#fff', fontSize: 15, fontWeight: '600' },
  hiddenPrint:     { position: 'absolute', left: -800, top: 0, width: 384, height: 2000 },

  // ── Print sheet ───────────────────────────────────────────────────────────────
  sheetOverlay:       { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:              { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44, gap: 10 },
  sheetTitle:         { fontSize: 18, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 6 },
  row2:               { flexDirection: 'row', gap: 10 },
  outlineBtn:         { flex: 1, borderWidth: 1.5, borderColor: '#1D4ED8', borderRadius: 12, paddingVertical: 16, alignItems: 'center', gap: 4 },
  outlineBtnIcon:     { fontSize: 20 },
  outlineBtnText:     { color: '#1D4ED8', fontWeight: '600', fontSize: 15 },
  primaryBtn:         { backgroundColor: '#1D4ED8', borderRadius: 12, paddingVertical: 18, alignItems: 'center' },
  primaryBtnText:     { color: '#fff', fontWeight: '700', fontSize: 16 },
  a4Btn:              { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  a4BtnText:          { color: '#64748B', fontSize: 15 },
  closeSheetBtn:      { paddingVertical: 12, alignItems: 'center', marginTop: 2 },
  closeSheetBtnText:  { color: '#94A3B8', fontSize: 15 },

  // ── Printer modal ─────────────────────────────────────────────────────────────
  printerHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  printerHeaderTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
  closeXBtn:          { padding: 8 },
  closeX:             { fontSize: 22, color: '#64748B' },
  deviceRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  btIconBg:           { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  btIconText:         { fontSize: 20 },
  deviceName:         { fontSize: 16, fontWeight: '600', color: '#111' },
  deviceAddr:         { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  pairedBadge:        { backgroundColor: '#DCFCE7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  pairedText:         { color: '#16A34A', fontSize: 12, fontWeight: '600' },
  noDevices:          { padding: 48, alignItems: 'center', gap: 10 },
  noDevicesText:      { fontSize: 16, fontWeight: '600', color: '#374151' },
  noDevicesSub:       { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },
  printerFooter:      { padding: 16, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#fff' },
  refreshBtn:         { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  refreshBtnText:     { color: '#64748B', fontSize: 15 },
});

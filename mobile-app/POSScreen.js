// ============================================================
// FixIT Pro — Mobile App (React Native + Expo, Sunmi)
// src/screens/POSScreen.js
// ============================================================
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, Vibration, ScrollView, Animated,
} from 'react-native';
import { Camera } from 'expo-camera';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { usePOSStore }     from '../store/posStore';
import { useProducts }     from '../hooks/useProducts';
import { printReceipt }    from '../services/SunmiPrinter';
import { api }             from '../services/api';

// ── Constants ─────────────────────────────────────────────
const PAYMENT_METHODS = [
  { key: 'cash',     label: 'เงินสด',  icon: '💵' },
  { key: 'qr',       label: 'QR Code', icon: '📱' },
  { key: 'card',     label: 'บัตร',    icon: '💳' },
  { key: 'transfer', label: 'โอน',     icon: '🏦' },
];

// ── POS Screen ────────────────────────────────────────────
export const POSScreen = ({ navigation }) => {
  const [scanActive, setScanActive]     = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paidAmount, setPaidAmount]     = useState('');
  const [loading, setLoading]           = useState(false);
  const [searchText, setSearchText]     = useState('');

  const { cart, addItem, removeItem, updateQty, clearCart, getTotal } = usePOSStore();
  const { searchProducts } = useProducts();
  const [searchResults, setSearchResults] = useState([]);

  // ── Barcode scan handler ─────────────────────────────────
  const handleBarcode = useCallback(async (barcode) => {
    setScanActive(false);
    Vibration.vibrate(50);  // haptic feedback

    try {
      const product = await api.get(`/products?barcode=${barcode}`);
      if (product.data?.data?.[0]) {
        addItem(product.data.data[0]);
      } else {
        Alert.alert('ไม่พบสินค้า', `บาร์โค้ด: ${barcode}`);
      }
    } catch (err) {
      Alert.alert('ข้อผิดพลาด', 'ไม่สามารถดึงข้อมูลสินค้าได้');
    }
  }, [addItem]);

  // ── Search products ──────────────────────────────────────
  const handleSearch = useCallback(async (text) => {
    setSearchText(text);
    if (text.length < 2) { setSearchResults([]); return; }
    const results = await searchProducts(text);
    setSearchResults(results);
  }, [searchProducts]);

  // ── Checkout ─────────────────────────────────────────────
  const handleCheckout = async () => {
    if (cart.length === 0) return Alert.alert('ไม่มีรายการ', 'กรุณาเพิ่มสินค้าก่อน');

    const total  = getTotal();
    const paid   = parseFloat(paidAmount);

    if (paymentMethod === 'cash' && (!paidAmount || paid < total)) {
      return Alert.alert('เงินไม่พอ', `ยอดรวม ฿${total.toLocaleString()}`);
    }

    setLoading(true);
    try {
      const order = await api.post('/sales/pos', {
        items:         cart.map(i => ({
          productId:   i.id,
          itemType:    'product',
          description: i.name,
          qty:         i.qty,
          unitPrice:   i.sell_price,
          unitCost:    i.cost_price,
        })),
        paymentMethod,
        paidAmount:    paymentMethod === 'cash' ? paid : total,
      });

      // พิมพ์ใบเสร็จผ่าน Sunmi AIDL
      await printReceipt({
        order:     order.data.data,
        items:     cart,
        paperSize: '80mm',
      });

      clearCart();
      setPaidAmount('');
      Alert.alert('สำเร็จ', `ออกบิล ${order.data.data.order_code} แล้ว`, [
        { text: 'ตกลง' },
      ]);
    } catch (err) {
      const msg = err.response?.data?.error;
      if (msg?.code === 'OUT_OF_STOCK') {
        // แสดงรายการสินค้าที่ขาด
        const list = msg.items.map(i =>
          `• ${i.name}: ต้องการ ${i.requested}, มี ${i.available}`
        ).join('\n');
        Alert.alert('สต็อกไม่พอ', list);
      } else {
        Alert.alert('ข้อผิดพลาด', msg?.message ?? 'กรุณาลองใหม่');
      }
    } finally {
      setLoading(false);
    }
  };

  const total    = getTotal();
  const change   = parseFloat(paidAmount || 0) - total;

  return (
    <View style={s.container}>
      {/* ── Barcode Scanner Modal ── */}
      {scanActive && (
        <BarcodeScanner
          onScan={handleBarcode}
          onClose={() => setScanActive(false)}
        />
      )}

      {/* ── Top toolbar ── */}
      <View style={s.toolbar}>
        <TextInput
          style={s.searchInput}
          placeholder="ค้นหาสินค้า / บาร์โค้ด..."
          placeholderTextColor="#64748b"
          value={searchText}
          onChangeText={handleSearch}
        />
        <TouchableOpacity style={s.scanBtn} onPress={() => setScanActive(true)}>
          <Text style={s.scanBtnText}>📷 สแกน</Text>
        </TouchableOpacity>
      </View>

      {/* ── Search results dropdown ── */}
      {searchResults.length > 0 && (
        <View style={s.dropdown}>
          {searchResults.slice(0, 5).map(p => (
            <TouchableOpacity
              key={p.id}
              style={s.dropdownItem}
              onPress={() => { addItem(p); setSearchText(''); setSearchResults([]); }}
            >
              <View>
                <Text style={s.dropdownName}>{p.name}</Text>
                <Text style={s.dropdownSku}>{p.sku} · สต็อก {p.stock_qty}</Text>
              </View>
              <Text style={s.dropdownPrice}>฿{p.sell_price.toLocaleString()}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Cart ── */}
      <FlatList
        data={cart}
        keyExtractor={i => i.cartId}
        style={s.cart}
        ListEmptyComponent={
          <View style={s.emptyCart}>
            <Text style={s.emptyIcon}>🛒</Text>
            <Text style={s.emptyText}>สแกนหรือค้นหาสินค้าเพื่อเพิ่มลงตะกร้า</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.cartRow}>
            <View style={s.cartInfo}>
              <Text style={s.cartName} numberOfLines={1}>{item.name}</Text>
              <Text style={s.cartPrice}>฿{item.sell_price.toLocaleString()} / ชิ้น</Text>
            </View>
            <View style={s.qtyControl}>
              <TouchableOpacity
                style={s.qtyBtn}
                onPress={() => updateQty(item.cartId, item.qty - 1)}
              >
                <Text style={s.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={s.qtyVal}>{item.qty}</Text>
              <TouchableOpacity
                style={s.qtyBtn}
                onPress={() => updateQty(item.cartId, item.qty + 1)}
              >
                <Text style={s.qtyBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.cartTotal}>
              ฿{(item.sell_price * item.qty).toLocaleString()}
            </Text>
            <TouchableOpacity onPress={() => removeItem(item.cartId)}>
              <Text style={s.removeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {/* ── Payment Panel ── */}
      <View style={s.payPanel}>
        {/* Payment method tabs */}
        <View style={s.pmTabs}>
          {PAYMENT_METHODS.map(pm => (
            <TouchableOpacity
              key={pm.key}
              style={[s.pmTab, paymentMethod === pm.key && s.pmTabActive]}
              onPress={() => setPaymentMethod(pm.key)}
            >
              <Text style={s.pmIcon}>{pm.icon}</Text>
              <Text style={[s.pmLabel, paymentMethod === pm.key && s.pmLabelActive]}>
                {pm.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Cash input */}
        {paymentMethod === 'cash' && (
          <View style={s.cashRow}>
            <Text style={s.cashLabel}>รับเงิน</Text>
            <TextInput
              style={s.cashInput}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#64748b"
              value={paidAmount}
              onChangeText={setPaidAmount}
            />
            <Text style={s.changeText}>
              เงินทอน: <Text style={{ color: change >= 0 ? '#34d399' : '#f87171' }}>
                ฿{Math.max(change, 0).toLocaleString()}
              </Text>
            </Text>
          </View>
        )}

        {/* Total + Checkout */}
        <View style={s.totalRow}>
          <View>
            <Text style={s.totalLabel}>{cart.length} รายการ</Text>
            <Text style={s.totalAmount}>฿{total.toLocaleString()}</Text>
          </View>
          <TouchableOpacity
            style={[s.checkoutBtn, (cart.length === 0 || loading) && s.checkoutBtnDisabled]}
            onPress={handleCheckout}
            disabled={cart.length === 0 || loading}
          >
            <Text style={s.checkoutBtnText}>
              {loading ? 'กำลังบันทึก...' : '💳 ชำระเงิน'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// ── StyleSheet ────────────────────────────────────────────
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#0d1117' },
  toolbar:    { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#161b22', borderBottomWidth: 0.5, borderBottomColor: '#1e293b' },
  searchInput:{ flex: 1, backgroundColor: '#1c2128', color: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, borderWidth: 0.5, borderColor: '#1e293b' },
  scanBtn:    { backgroundColor: '#22d3ee', borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
  scanBtnText:{ color: '#0d1117', fontWeight: '700', fontSize: 13 },

  dropdown:     { backgroundColor: '#1c2128', borderWidth: 0.5, borderColor: '#1e293b', marginHorizontal: 12, borderRadius: 8, zIndex: 10 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 0.5, borderBottomColor: '#1e293b' },
  dropdownName: { color: '#e2e8f0', fontSize: 13, fontWeight: '500' },
  dropdownSku:  { color: '#64748b', fontSize: 11, marginTop: 2 },
  dropdownPrice:{ color: '#22d3ee', fontSize: 14, fontWeight: '600' },

  cart:     { flex: 1 },
  emptyCart:{ alignItems: 'center', paddingVertical: 60 },
  emptyIcon:{ fontSize: 48, marginBottom: 12 },
  emptyText:{ color: '#64748b', fontSize: 14, textAlign: 'center' },

  cartRow:   { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 0.5, borderBottomColor: '#1e293b', gap: 10 },
  cartInfo:  { flex: 1 },
  cartName:  { color: '#e2e8f0', fontSize: 13, fontWeight: '500' },
  cartPrice: { color: '#64748b', fontSize: 11, marginTop: 2 },
  qtyControl:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn:    { width: 28, height: 28, backgroundColor: '#1c2128', borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#1e293b' },
  qtyBtnText:{ color: '#e2e8f0', fontSize: 16 },
  qtyVal:    { color: '#e2e8f0', fontSize: 15, fontWeight: '600', minWidth: 24, textAlign: 'center' },
  cartTotal: { color: '#22d3ee', fontSize: 14, fontWeight: '600', minWidth: 80, textAlign: 'right' },
  removeBtn: { color: '#64748b', fontSize: 16, padding: 4 },

  payPanel:   { backgroundColor: '#161b22', borderTopWidth: 0.5, borderTopColor: '#1e293b', padding: 14 },
  pmTabs:     { flexDirection: 'row', gap: 8, marginBottom: 12 },
  pmTab:      { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: '#1c2128', borderWidth: 0.5, borderColor: '#1e293b' },
  pmTabActive:{ backgroundColor: 'rgba(34,211,238,0.12)', borderColor: 'rgba(34,211,238,0.35)' },
  pmIcon:     { fontSize: 18, marginBottom: 2 },
  pmLabel:    { color: '#64748b', fontSize: 11 },
  pmLabelActive:{ color: '#22d3ee' },

  cashRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  cashLabel:  { color: '#94a3b8', fontSize: 13 },
  cashInput:  { flex: 1, backgroundColor: '#1c2128', color: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 18, fontWeight: '700', borderWidth: 0.5, borderColor: '#1e293b', textAlign: 'right' },
  changeText: { color: '#94a3b8', fontSize: 13 },

  totalRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel:    { color: '#64748b', fontSize: 12 },
  totalAmount:   { color: '#e2e8f0', fontSize: 26, fontWeight: '700' },
  checkoutBtn:         { backgroundColor: '#22d3ee', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 10 },
  checkoutBtnDisabled: { opacity: 0.4 },
  checkoutBtnText:     { color: '#0d1117', fontSize: 15, fontWeight: '700' },
});

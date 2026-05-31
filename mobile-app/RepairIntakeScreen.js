// ============================================================
// src/screens/RepairIntakeScreen.js — รับงานซ่อมบน Sunmi
// ============================================================
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, KeyboardAvoidingView,
} from 'react-native';
import { api }          from '../services/api';
import { printIntake }  from '../services/SunmiPrinter';

const DEVICE_TYPES = ['iPhone', 'Samsung', 'MacBook', 'iPad', 'Dell', 'HP', 'Asus', 'Lenovo', 'อื่นๆ'];

export const RepairIntakeScreen = ({ navigation }) => {
  const [form, setForm] = useState({
    customerName:   '',
    customerPhone:  '',
    deviceType:     '',
    deviceColor:    '',
    serialNo:       '',
    devicePassword: '',
    symptom:        '',
    laborCost:      '',
    estimatedDays:  '3',
    warrantyDays:   '7',
  });
  const [loading, setLoading] = useState(false);

  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    if (!form.customerName || !form.deviceType || !form.symptom) {
      return Alert.alert('กรุณากรอกข้อมูล', 'ชื่อลูกค้า, ประเภทอุปกรณ์ และอาการ จำเป็นต้องระบุ');
    }

    setLoading(true);
    try {
      const estimatedDone = new Date();
      estimatedDone.setDate(estimatedDone.getDate() + parseInt(form.estimatedDays || 3));

      const job = await api.post('/repair-jobs', {
        customerName:   form.customerName,
        customerPhone:  form.customerPhone || null,
        deviceType:     form.deviceType,
        deviceColor:    form.deviceColor || null,
        serialNo:       form.serialNo || null,
        devicePassword: form.devicePassword || null,
        symptom:        form.symptom,
        laborCost:      parseFloat(form.laborCost) || 0,
        warrantyDays:   parseInt(form.warrantyDays) || 0,
        estimatedDone:  estimatedDone.toISOString(),
      });

      // พิมพ์ใบรับซ่อมทันที
      await printIntake({ job: job.data.data, paperSize: '80mm' });

      Alert.alert(
        'รับงานสำเร็จ',
        `เลขที่งาน: ${job.data.data.job_code}\nพิมพ์ใบรับซ่อมแล้ว`,
        [{ text: 'รับงานใหม่', onPress: () => setForm({ customerName:'',customerPhone:'',deviceType:'',deviceColor:'',serialNo:'',devicePassword:'',symptom:'',laborCost:'',estimatedDays:'3',warrantyDays:'7' }) }]
      );
    } catch (err) {
      Alert.alert('ข้อผิดพลาด', err.response?.data?.error?.message ?? 'ไม่สามารถบันทึกได้');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior="height">
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Section: ลูกค้า */}
        <Text style={s.sectionTitle}>ข้อมูลลูกค้า</Text>
        <Field label="ชื่อลูกค้า *" value={form.customerName} onChangeText={set('customerName')} placeholder="คุณสมชาย" />
        <Field label="เบอร์โทร" value={form.customerPhone} onChangeText={set('customerPhone')} placeholder="08x-xxx-xxxx" keyboardType="phone-pad" />

        {/* Section: อุปกรณ์ */}
        <Text style={s.sectionTitle}>ข้อมูลอุปกรณ์</Text>
        <Text style={s.label}>ประเภทอุปกรณ์ *</Text>
        <View style={s.chipRow}>
          {DEVICE_TYPES.map(d => (
            <TouchableOpacity
              key={d}
              style={[s.chip, form.deviceType === d && s.chipActive]}
              onPress={() => set('deviceType')(d)}
            >
              <Text style={[s.chipText, form.deviceType === d && s.chipTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Field label="รุ่น / สี" value={form.deviceColor} onChangeText={set('deviceColor')} placeholder="Pro Max / สีดำ" />
        <Field label="Serial No." value={form.serialNo} onChangeText={set('serialNo')} placeholder="FVFXXXXXPHR" />
        <Field label="รหัสผ่านเครื่อง" value={form.devicePassword} onChangeText={set('devicePassword')} placeholder="0000 (เพื่อทดสอบ)" secureTextEntry />

        {/* Section: งานซ่อม */}
        <Text style={s.sectionTitle}>รายละเอียดงาน</Text>
        <Text style={s.label}>อาการที่แจ้ง *</Text>
        <TextInput
          style={[s.input, s.textarea]}
          value={form.symptom}
          onChangeText={set('symptom')}
          placeholder="เช่น จอไม่ติด กดปุ่ม Home ไม่ได้ แบตหมดเร็ว..."
          placeholderTextColor="#64748b"
          multiline
          numberOfLines={3}
        />

        <View style={s.rowFields}>
          <View style={{ flex: 1 }}>
            <Field label="ค่าแรงประมาณ (฿)" value={form.laborCost} onChangeText={set('laborCost')} keyboardType="numeric" placeholder="500" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="กำหนดส่ง (วัน)" value={form.estimatedDays} onChangeText={set('estimatedDays')} keyboardType="numeric" placeholder="3" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="ประกัน (วัน)" value={form.warrantyDays} onChangeText={set('warrantyDays')} keyboardType="numeric" placeholder="7" />
          </View>
        </View>

        <TouchableOpacity
          style={[s.submitBtn, loading && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={s.submitBtnText}>
            {loading ? 'กำลังบันทึก...' : '✅ รับงานและพิมพ์ใบรับซ่อม'}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ── Shared Field Component ─────────────────────────────────
const Field = ({ label, ...props }) => (
  <View style={s.fieldWrap}>
    <Text style={s.label}>{label}</Text>
    <TextInput style={s.input} placeholderTextColor="#64748b" {...props} />
  </View>
);

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0d1117' },
  scroll:       { padding: 16, paddingBottom: 40 },
  sectionTitle: { color: '#22d3ee', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 20, marginBottom: 10 },
  label:        { color: '#94a3b8', fontSize: 12, marginBottom: 5 },
  fieldWrap:    { marginBottom: 12 },
  input:        { backgroundColor: '#161b22', color: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 0.5, borderColor: '#1e293b' },
  textarea:     { minHeight: 80, textAlignVertical: 'top' },
  rowFields:    { flexDirection: 'row', gap: 8 },
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip:         { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#161b22', borderWidth: 0.5, borderColor: '#1e293b' },
  chipActive:   { backgroundColor: 'rgba(34,211,238,0.12)', borderColor: 'rgba(34,211,238,0.4)' },
  chipText:     { color: '#94a3b8', fontSize: 13 },
  chipTextActive:{ color: '#22d3ee' },
  submitBtn:         { backgroundColor: '#22d3ee', paddingVertical: 15, borderRadius: 10, alignItems: 'center', marginTop: 24 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText:     { color: '#0d1117', fontSize: 15, fontWeight: '700' },
});

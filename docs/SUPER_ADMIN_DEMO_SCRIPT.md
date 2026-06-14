# Super Admin V2 — Demo Script (5 Minutes)

**Audience:** Client / Stakeholder  
**Environment:** DEV (localhost:3001)  
**Login:** superadmin@fixitpro.com / admin1234  
**Date:** Wednesday presentation  

---

## Package Concept (30 seconds — before screen share)

> "FixITPro ใช้โมเดล **สาขาเป็น unit การจัดการ** ไม่จำกัด users, สินค้า, งานซ่อม
> แต่จำกัดที่จำนวนสาขา ลูกค้าสามารถเปิดแพ็คเกจได้ 4 ระดับ:
> **Founding Customer (Trial) → Starter → Business → Enterprise**"

---

## Step-by-step Flow

### 1. Login (15 sec)

- Open `http://localhost:3001/login`
- Email: `superadmin@fixitpro.com`  Password: `admin1234`
- **Talking point:** "นี่คือหน้า login ของ Super Admin ระบบหลังบ้านที่แยกออกมาจาก POS"

---

### 2. Dashboard (30 sec)

- URL: `/super-admin`
- **Show:** Tenant stats cards (Total / Active / Expiring Soon / Expired)
- **Show:** Recent tenants list with status badges
- **Talking point:**  
  > "Dashboard แสดงภาพรวมทันที — กี่ร้านใช้งานอยู่ กี่ร้านใกล้หมดอายุ กี่ร้านค้างชำระ  
  > ไม่ต้องเปิด database ก็รู้สถานะทั้งแพลตฟอร์ม"

---

### 3. Tenants List (45 sec)

- Click **Tenants** in sidebar → `/super-admin/tenants`
- **Point out status variety:**
  - 🟢 ACTIVE — Charif PC & All (Enterprise), TJ Computer (Business / expiring soon)
  - 🟠 SUSPENDED — Smart Fix Thailand
  - 🔴 EXPIRED — BB IT Service
  - 🔵 PENDING — PhoneHub Krabi
- **Talking point:**  
  > "แต่ละสถานะมีสีและ badge ต่างกัน ดูได้ชัดเจนว่าร้านไหนต้องติดตามด่วน"

---

### 4. Tenant Detail (60 sec)

- Click **Charif PC & All** → `/super-admin/tenants/:id`

**Tab: Overview**
- Show plan badge, status, expiry date, owner info
- **Talking point:** "ดูข้อมูลร้านได้ทันที — แพ็คเกจ, วันหมดอายุ, เจ้าของ"

**Tab: Branches**
- Show branch list for this tenant
- **Talking point:**  
  > "นี่คือ unit ที่เราจัดการ — ร้านนี้มีกี่สาขา แต่ละสาขาสถานะเป็นอย่างไร"

**Tab: Users**
- Show users list (OWNER, MANAGER, CASHIER, etc.)
- **Talking point:**  
  > "ไม่จำกัด users ภายใต้แพ็คเกจ — สาขาละเท่าไหร่ก็ได้"

**Tab: Payments**
- Show payment history (VERIFIED + ACTIVATED)
- **Talking point:** "ประวัติการชำระเงินครบ — วันที่, ยอด, อ้างอิง, ผู้ยืนยัน"

**Tab: Activity**
- Show tenant-specific audit log
- **Talking point:** "ทุก action ที่เกิดกับร้านนี้บันทึกไว้ — สร้างร้าน, ต่ออายุ, ยืนยันจ่าย"

---

### 5. Package Actions (30 sec)

- Go back to Tenants list
- Click **BB IT Service** (EXPIRED)
- Click **"ต่ออายุ"** (Renew)
- Select plan PRO, duration 30, note "demo renewal"
- **Show:** Status changes to ACTIVE, expiry updated
- **Talking point:**  
  > "ต่ออายุได้จากหน้าเดียว ไม่ต้องลง database โดยตรง"

---

### 6. Payments (30 sec)

- Click **Payments** in sidebar → `/super-admin/payments`
- **Show:** Pending payments (TJ Computer + BB IT Service pending)
- Click a PENDING payment → Show **Verify / Reject** actions
- **Talking point:**  
  > "Super Admin ยืนยันสลิปการโอน — กด Verify แล้วระบบ activate แพ็คเกจให้เลย"

---

### 7. Analytics (30 sec)

- Click **Analytics** → `/super-admin/analytics`
- **Show:** MRR / ARR / Total Revenue cards
- **Show:** Revenue by Month bar chart (CSS, no library)
- **Show:** Plan distribution (Enterprise, Business, Starter, Trial)
- **Show:** Tenant status breakdown
- **Talking point:**  
  > "MRR คือรายได้จากแพ็คเกจที่ activate ใน 30 วันที่ผ่านมา  
  > ARR คือ projection ทั้งปี — ดูแนวโน้มธุรกิจได้เลย"

---

### 8. Audit Logs (20 sec)

- Click **Audit Logs** → `/super-admin/audit-logs`
- **Show:** Activity timeline (TENANT_CREATED, ACTIVATE, PAYMENT_VERIFIED, PAYMENT_REJECTED, PASSWORD_RESET)
- Try searching for "Charif" to filter
- **Talking point:**  
  > "ทุก action ของ Super Admin มี log — ไม่มีอะไรหาย audit trail ครบ"

---

### 9. Settings (15 sec)

- Click **Settings** → `/super-admin/settings`
- **Show:** Platform info (version, environment), Security (HttpOnly cookie), Database (PostgreSQL)
- **Show:** Shop Settings section — click **"แก้ไขข้อมูลร้าน"**
- Edit shopName, phone, click Save
- **Talking point:**  
  > "ตั้งค่าร้านหลักได้จากที่นี่ — ชื่อร้าน เลขภาษี ข้อมูล receipt"

---

## Closing (15 sec)

> "ระบบ Super Admin พร้อมใช้งาน DEV แล้ว  
> ก่อน deploy PROD ยังรอ SUNMI device test (CHB-01) สำหรับ cookie auth บน Android"

---

## Quick Reference

| Plan Label | DB Value | Price/Month |
|---|---|---|
| Founding Customer | TRIAL | ฿0 (30 วัน) |
| Starter | BASIC | ฿1,500 |
| Business | PRO | ฿2,500 |
| Enterprise | ENTERPRISE | ฿9,900/ปี |

---

## Demo Tenant Quick List

| Shop | Status | Plan | Note |
|---|---|---|---|
| Charif PC & All | ACTIVE | Enterprise | Flagship, annual paid |
| TJ Computer | ACTIVE | Business | Expiring in 5 days |
| Smart Fix Thailand | SUSPENDED | Starter | Payment rejected |
| BB IT Service | EXPIRED | Starter | Pending renewal |
| PhoneHub Krabi | PENDING | Trial | New registration |

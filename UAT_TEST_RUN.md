# FixITPro — UAT Test Run

> **⚠ DEV ONLY — ห้ามใช้กับ PROD โดยเด็ดขาด**
> อ้างอิง: [REAL_USE_TEST_CHECKLIST.md](./REAL_USE_TEST_CHECKLIST.md)

---

## ข้อมูลการทดสอบ

| รายการ | รายละเอียด |
|--------|-----------|
| **วันที่ทดสอบ** | __________________ |
| **เวลาเริ่ม** | __________________ |
| **เวลาสิ้นสุด** | __________________ |
| **ผู้ทดสอบ** | __________________ |
| **รุ่น App** | __________________ |
| **Git Branch** | __________________ |
| **Git Commit** | __________________ |

---

## สภาพแวดล้อม (Environment)

| รายการ | ค่า |
|--------|-----|
| **Backend URL** | http://localhost:4000 |
| **Frontend URL** | http://localhost:3001 |
| **Database** | DEV database (local) |
| **Browser** | __________________ |
| **Device (SUNMI)** | __________________ |
| **OS** | __________________ |
| **หมายเหตุ** | DEV only · ห้าม deploy PROD |

---

## สรุป Checklist จาก REAL_USE_TEST_CHECKLIST.md

| หมวด | รายการทดสอบ | จำนวน |
|------|------------|-------|
| 1. Login by Role | OWNER / MANAGER / CASHIER / TECHNICIAN / STAFF | 5 |
| 2. Daily Frontdesk | Open Shift / POS / Print / Refund / Void | 5 |
| 3. Repair Flow | Intake / Photos / Assign / Parts / Pay / Warranty / Delivery / Print | 8 |
| 4. Debt Flow | Partial / Full / Print | 3 |
| 5. Stock | Adjust / Transfer / Low Stock | 3 |
| 6. Reports | Daily Closing / Profit / Branch Filter | 3 |
| 7. Security | Branch Scope / Role Block / Audit Log | 3 |
| 8. Backup | Create / Verify | 2 |
| 9. SUNMI | Mobile POS / Repair Intake / Debt Payment | 3 |
| **รวม** | | **35 หมวดใหญ่ / ~100 รายการย่อย** |

---

## ตารางผลการทดสอบ

> ช่อง **ผลจริง**: กรอกสิ่งที่เกิดขึ้นจริงระหว่างทดสอบ
> ช่อง **ผ่าน/ไม่ผ่าน**: ✅ ผ่าน · ❌ ไม่ผ่าน · ⚠️ ผ่านบางส่วน · ⏭ ข้ามรายการนี้

---

### หมวด 1 — เข้าสู่ระบบตาม Role

| Test ID | รายการทดสอบ | Role | ผลที่คาดหวัง | ผลจริง | ผ่าน/ไม่ผ่าน | หมายเหตุ |
|---------|------------|------|-------------|--------|--------------|---------|
| T01 | เข้าสู่ระบบ + เมนูครบทุกส่วน | OWNER | เห็น Dashboard / Repairs / POS / Stock / Reports / Settings / Users | | | |
| T02 | แก้ไข Settings ชื่อร้านได้ | OWNER | บันทึกสำเร็จ แสดงชื่อใหม่ทันที | | | |
| T03 | เข้า Users > สร้าง/แก้ไข User ได้ | OWNER | สร้าง User ใหม่สำเร็จ | | | |
| T04 | เข้า Reports > Profit Report ได้ | OWNER | แสดงหน้า Profit ได้ | | | |
| T05 | ออกจากระบบ redirect ถูกต้อง | OWNER | ไปหน้า /login | | | |
| T06 | เข้าสู่ระบบ + เมนูหลักครบ | MANAGER | เห็นเมนูหลักครบ | | | |
| T07 | สร้างใบงานซ่อม / ปิดกะได้ | MANAGER | ทำรายการได้ปกติ | | | |
| T08 | เข้าสู่ระบบ + เข้า POS / รับชำระได้ | CASHIER | ทำรายการ POS ได้ | | | |
| T09 | CASHIER เข้า Reports — ต้องถูกบล็อก | CASHIER | 403 หรือซ่อนเมนู | | | |
| T10 | CASHIER เข้า Settings — ต้องถูกบล็อก | CASHIER | 403 หรือซ่อนเมนู | | | |
| T11 | เข้าสู่ระบบ + เห็นงานที่ assign | TECHNICIAN | เห็นงานของตัวเอง | | | |
| T12 | อัปเดตสถานะงานซ่อมได้ | TECHNICIAN | DIAGNOSING → IN_PROGRESS → COMPLETED | | | |
| T13 | TECHNICIAN เข้า POS — ต้องถูกบล็อก | TECHNICIAN | 403 หรือซ่อนเมนู | | | |
| T14 | STAFF เข้าดูรายการงานซ่อมได้ (read-only) | STAFF | เห็นรายการ แต่ไม่มีปุ่มแก้ไข | | | |
| T15 | STAFF เรียก DELETE /repairs/:id ตรง — ถูกบล็อก | STAFF | API return 403 | | | |

---

### หมวด 2 — Daily Frontdesk Flow

| Test ID | รายการทดสอบ | Role | ผลที่คาดหวัง | ผลจริง | ผ่าน/ไม่ผ่าน | หมายเหตุ |
|---------|------------|------|-------------|--------|--------------|---------|
| T16 | เปิดกะใหม่ได้สำเร็จ | OWNER/CASHIER | timestamp กะแสดง, การ์ดสีเขียว | | | |
| T17 | เปิดกะซ้ำ — ต้องได้รับ error | OWNER/CASHIER | Error "มีกะที่เปิดอยู่แล้ว" | | | |
| T18 | ขายสินค้า POS ครบขั้นตอน | CASHIER | บิลบันทึก, สต็อกลด, ใบเสร็จ | | | |
| T19 | พิมพ์ใบเสร็จ POS | CASHIER | Preview ถูกต้อง, พิมพ์ได้ | | | |
| T20 | คืนเงิน (Refund) บิลที่ขายแล้ว | OWNER/MANAGER | สต็อกคืน, บิลสถานะ "คืนเงินแล้ว" | | | |
| T21 | ยกเลิกตะกร้าก่อนยืนยันบิล (Void) | CASHIER | ตะกร้าว่าง ไม่มี record ใน DB | | | |

---

### หมวด 3 — Repair Flow

| Test ID | รายการทดสอบ | Role | ผลที่คาดหวัง | ผลจริง | ผ่าน/ไม่ผ่าน | หมายเหตุ |
|---------|------------|------|-------------|--------|--------------|---------|
| T22 | ค้นหาลูกค้าเดิมด้วยเบอร์โทร | OWNER/CASHIER | Auto-search เมื่อพิมพ์ 3+ ตัว | | | |
| T23 | เลือกลูกค้า — ข้อมูล fill อัตโนมัติ | OWNER/CASHIER | ชื่อ/เบอร์ fill ถูกต้อง | | | |
| T24 | กรอกลูกค้าใหม่ + รับงานซ่อมสำเร็จ | OWNER/CASHIER | ใบงานถูกสร้าง, มี ticketNumber | | | |
| T25 | Quick Model chips แสดงเมื่อเลือก Brand | OWNER/CASHIER | Chips แสดงรุ่นยอดนิยมของ brand นั้น | | | |
| T26 | แตะ Quick Model — field รุ่น fill ทันที | OWNER/CASHIER | deviceModel fill ถูกต้อง | | | |
| T27 | เพิ่มรูปถ่าย (ถ่ายรูป / เลือกรูป) | OWNER/CASHIER | รูปแสดงใน preview, upload สำเร็จ | | | |
| T28 | เพิ่มรูปเกิน 6 — ต้องถูกจำกัด | OWNER/CASHIER | ปุ่มซ่อน / รูปที่ 7 ไม่ถูก add | | | |
| T29 | Assign ช่าง + บันทึกสำเร็จ | OWNER/MANAGER | Dropdown แสดงช่าง, บันทึกได้ | | | |
| T30 | เปลี่ยนช่าง — Timeline แสดง event | OWNER/MANAGER | Timeline มี event assign ช่างใหม่ | | | |
| T31 | เพิ่มอะไหล่ + Cost Summary อัปเดต | TECHNICIAN | ยอดรวม Parts + Labor ถูกต้อง | | | |
| T32 | Parts ถูก lock เมื่อสถานะ COMPLETED | OWNER/CASHIER | ปุ่ม Add/Remove Parts ไม่แสดง | | | |
| T33 | รับชำระงานซ่อม (Payment) | CASHIER | สถานะ DELIVERED, paidAt บันทึก | | | |
| T34 | DELIVERED เกิดเฉพาะผ่าน Payment เท่านั้น | OWNER | Status dropdown ไม่มี DELIVERED | | | |
| T35 | Warranty แสดงถูกต้องหลัง DELIVERED | OWNER | "อยู่ในประกัน" / "หมดประกัน" ถูกต้อง | | | |
| T36 | พิมพ์ใบรับซ่อม — Preview + Print | OWNER/CASHIER | PrinterFlowSheet เปิด, Print ได้ | | | |

---

### หมวด 4 — Debt Flow

| Test ID | รายการทดสอบ | Role | ผลที่คาดหวัง | ผลจริง | ผ่าน/ไม่ผ่าน | หมายเหตุ |
|---------|------------|------|-------------|--------|--------------|---------|
| T37 | Quick Amount "ครึ่ง" fill 50% | CASHIER | amount = 50% ของยอดคงเหลือ | | | |
| T38 | ชำระบางส่วน — status PARTIAL | CASHIER | paymentStatus = PARTIAL, ยอดลด | | | |
| T39 | Quick Amount "ครบ" fill ยอดเต็ม | CASHIER | amount = ยอดคงเหลือ, ข้อความ "✓ ชำระครบ" | | | |
| T40 | ชำระครบ — หายออกจากหน้า Debt | CASHIER | paymentStatus = PAID, ใบงานหาย | | | |
| T41 | พิมพ์ใบเสร็จหนี้หลังชำระ | CASHIER | ReceiptModal เปิด, Print ได้ | | | |

---

### หมวด 5 — Stock Management

| Test ID | รายการทดสอบ | Role | ผลที่คาดหวัง | ผลจริง | ผ่าน/ไม่ผ่าน | หมายเหตุ |
|---------|------------|------|-------------|--------|--------------|---------|
| T42 | ปรับสต็อก + / − พร้อมเหตุผล | OWNER/MANAGER | สต็อกอัปเดต, Audit log บันทึก | | | |
| T43 | ปรับสต็อกให้ต่ำกว่า 0 — ต้องถูกบล็อก | OWNER/MANAGER | Error ไม่อนุญาต | | | |
| T44 | โอนย้ายสาขา — สต็อกสองสาขาอัปเดต | OWNER/MANAGER | Branch A ลด, Branch B เพิ่ม | | | |
| T45 | โอนมากกว่าที่มี — ต้องถูกบล็อก | OWNER/MANAGER | Error จำนวนไม่พอ | | | |
| T46 | Low Stock Notification แสดงเมื่อต่ำกว่า threshold | OWNER/MANAGER | Badge Bell แสดงจำนวน, แจ้งเตือนใน /notifications | | | |

---

### หมวด 6 — Reports

| Test ID | รายการทดสอบ | Role | ผลที่คาดหวัง | ผลจริง | ผ่าน/ไม่ผ่าน | หมายเหตุ |
|---------|------------|------|-------------|--------|--------------|---------|
| T47 | Daily Summary แสดงรายได้วันนี้ถูกต้อง | OWNER/MANAGER | ยอด POS + งานซ่อม + ค่าใช้จ่าย | | | |
| T48 | CASHIER เข้า Daily Summary — ถูกบล็อก | CASHIER | 403 หรือ redirect | | | |
| T49 | Profit Report เลือกช่วงวันที่ได้ | OWNER | ข้อมูลโหลดตามช่วงวันที่ | | | |
| T50 | Branch Filter เปลี่ยนข้อมูลตาม branch | OWNER | การ์ดสรุปอัปเดต | | | |

---

### หมวด 7 — Security

| Test ID | รายการทดสอบ | Role | ผลที่คาดหวัง | ผลจริง | ผ่าน/ไม่ผ่าน | หมายเหตุ |
|---------|------------|------|-------------|--------|--------------|---------|
| T51 | User Branch A เรียกข้อมูล Branch B ตรง | CASHIER | API return 403 | | | |
| T52 | CASHIER เรียก DELETE /repairs/:id | CASHIER | API return 403 | | | |
| T53 | TECHNICIAN เรียก GET /reports/profit | TECHNICIAN | API return 403 | | | |
| T54 | Token หมดอายุ — redirect /login | ทุก Role | Redirect อัตโนมัติ | | | |
| T55 | Audit Log บันทึก Payment / Refund / Adjust | OWNER | Log แสดงใน Admin พร้อม userId + timestamp | | | |

---

### หมวด 8 — Backup

| Test ID | รายการทดสอบ | Role | ผลที่คาดหวัง | ผลจริง | ผ่าน/ไม่ผ่าน | หมายเหตุ |
|---------|------------|------|-------------|--------|--------------|---------|
| T56 | สร้าง Backup สำเร็จ | OWNER | Progress แสดง, ข้อความสำเร็จ + ชื่อไฟล์ | | | |
| T57 | ตรวจสอบไฟล์ Backup ใน path ที่กำหนด | OWNER | ไฟล์มีอยู่จริง, ขนาด > 0 bytes | | | |

---

### หมวด 9 — SUNMI / Mobile

| Test ID | รายการทดสอบ | Role | ผลที่คาดหวัง | ผลจริง | ผ่าน/ไม่ผ่าน | หมายเหตุ |
|---------|------------|------|-------------|--------|--------------|---------|
| T58 | Mobile POS auto-focus barcode input | CASHIER | Cursor อยู่ที่ช่อง input ทันที | | | |
| T59 | แตะสินค้าใน grid — เพิ่มตะกร้าทันที | CASHIER | จำนวน +1 ทันที ไม่ต้องยืนยัน | | | |
| T60 | Sticky cart แสดงยอดรวมตลอด | CASHIER | ยอดรวมอัปเดตเรียลไทม์ | | | |
| T61 | พิมพ์ซ้ำใบเสร็จล่าสุด (Reprint) | CASHIER | PrinterFlowSheet เปิดพร้อมบิลล่าสุด | | | |
| T62 | Bottom Nav 5 ปุ่มทำงานถูกต้อง | CASHIER | หน้าหลัก / ขาย / งานซ่อม / หนี้ / แจ้งเตือน | | | |
| T63 | SUNMI Repair Intake — ค้นหาลูกค้า auto-search | CASHIER | ผลลัพธ์ขึ้นหลัง 400ms ที่ 3+ ตัว | | | |
| T64 | SUNMI Repair Intake — Quick Model chips | CASHIER | แสดงหลังเลือก brand, แตะแล้ว fill | | | |
| T65 | SUNMI Repair Intake — ปุ่มถ่ายรูปขนาดใหญ่ | CASHIER | ปุ่ม h-24 แตะง่ายบน SUNMI | | | |
| T66 | SUNMI Debt Payment — Quick Amount ครบ/ครึ่ง | CASHIER | fill ยอดถูกต้อง | | | |
| T67 | SUNMI Debt Payment — ปุ่มรับชำระขนาดใหญ่ | CASHIER | ปุ่ม h-14 แตะง่าย, ทำรายการสำเร็จ | | | |

---

## บันทึก Bug

> เพิ่มรายการ bug ที่พบระหว่างทดสอบ

| Bug ID | Test ID ที่เกี่ยวข้อง | หน้า / Component | อาการปัญหา | ความรุนแรง | Path ภาพหน้าจอ | สถานะ |
|--------|----------------------|-----------------|-----------|-----------|---------------|-------|
| BUG-001 | | | | | | 🔴 ยังไม่แก้ |
| BUG-002 | | | | | | 🔴 ยังไม่แก้ |
| BUG-003 | | | | | | 🔴 ยังไม่แก้ |

> **ระดับความรุนแรง:**
> 🔴 **Critical** — บล็อกการใช้งานหลัก · 🟠 **High** — กระทบฟีเจอร์หลัก · 🟡 **Medium** — กระทบ UX แต่มี workaround · 🟢 **Low** — เล็กน้อย / cosmetic

> **สถานะ Bug:**
> 🔴 ยังไม่แก้ · 🟡 กำลังแก้ · 🟢 แก้แล้ว · ⏭ ยืนยันปิด

---

## บันทึกข้อเสนอแนะ (Improvement Log)

> รายการที่ระบบทำงานถูกต้อง แต่อยากปรับปรุง UX / ประสิทธิภาพในอนาคต

| ลำดับ | หน้า / Component | ข้อเสนอแนะ | ลำดับความสำคัญ | หมายเหตุ |
|-------|-----------------|-----------|--------------|---------|
| IMP-001 | | | 🔴 สูง / 🟡 กลาง / 🟢 ต่ำ | |
| IMP-002 | | | | |
| IMP-003 | | | | |

---

## สรุปผลการทดสอบ

| หมวด | รายการทั้งหมด | ✅ ผ่าน | ❌ ไม่ผ่าน | ⚠️ บางส่วน | ⏭ ข้ามรายการ |
|------|-------------|--------|----------|----------|------------|
| 1. Login by Role | 10 | | | | |
| 2. Daily Frontdesk | 6 | | | | |
| 3. Repair Flow | 15 | | | | |
| 4. Debt Flow | 5 | | | | |
| 5. Stock | 5 | | | | |
| 6. Reports | 4 | | | | |
| 7. Security | 5 | | | | |
| 8. Backup | 2 | | | | |
| 9. SUNMI | 10 | | | | |
| **รวม** | **62** | | | | |

---

## Bug Summary

| ระดับ | จำนวน | แก้แล้ว | ยังค้างอยู่ |
|-------|-------|---------|-----------|
| 🔴 Critical | | | |
| 🟠 High | | | |
| 🟡 Medium | | | |
| 🟢 Low | | | |
| **รวม** | | | |

---

## สรุปและลงนามรับรอง (Sign-Off)

### พร้อม Deploy ไป PROD หรือไม่

```
[ ] ✅  พร้อม PROD — ผ่านทุกรายการ Critical และ High ไม่มีค้าง
[ ] ⚠️  พร้อม PROD แบบมีเงื่อนไข — มี bug ค้างอยู่แต่ไม่ใช่ Critical
[ ] ❌  ยังไม่พร้อม PROD — มี Critical bug ค้างอยู่
```

### Blocker ที่ยังค้างอยู่ (ถ้ามี)

| ลำดับ | Bug ID | อาการ | ผู้รับผิดชอบ | กำหนดแก้ |
|-------|--------|-------|------------|---------|
| 1 | | | | |
| 2 | | | | |

### ลายเซ็นผู้ทดสอบ

| รายการ | รายละเอียด |
|--------|-----------|
| **ชื่อผู้ทดสอบ** | __________________ |
| **วันที่ลงนาม** | __________________ |
| **ลายเซ็น / ยืนยัน** | __________________ |
| **หมายเหตุเพิ่มเติม** | |

---

> **⚠ DEV ONLY** — เอกสารนี้ใช้สำหรับ DEV environment เท่านั้น
> ห้าม deploy PROD จนกว่าจะมีการลงนาม Sign-Off และ bug ทุก Critical ถูกปิด

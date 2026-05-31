# FixITPro — Real-Use Test Checklist (DEV)

> **สภาพแวดล้อม:** DEV เท่านั้น · Backend port 3000 · Frontend port 3001
> **ห้ามใช้กับ PROD** · ห้าม reset หรือ drop database production
> อัปเดตล่าสุด: 2026-05-24

---

## วิธีใช้ Checklist นี้

- ทำเครื่องหมาย `[x]` เมื่อผ่าน, `[!]` เมื่อพบปัญหา
- บันทึกอาการและ step ที่พบปัญหาไว้ใต้แต่ละรายการ
- ทดสอบใน incognito / ล้าง localStorage ก่อนเริ่มแต่ละ Role
- ตรวจสอบ Network tab และ Console สำหรับ error ที่ซ่อนอยู่

---

## 1. เข้าสู่ระบบตาม Role

### 1.1 OWNER
- [ ] เข้า `/login` ด้วย credential ของ OWNER
- [ ] เห็นเมนูครบทุกส่วน (Dashboard, Repairs, POS, Stock, Reports, Settings, Users)
- [ ] เข้า Settings > แก้ไขชื่อร้านได้
- [ ] เข้า Users > เห็น/สร้าง/แก้ไขผู้ใช้ได้
- [ ] เข้า Reports > เห็น Profit Report ได้
- [ ] ออกจากระบบ — redirect กลับ `/login`

### 1.2 MANAGER
- [ ] เข้าสู่ระบบด้วย credential ของ MANAGER
- [ ] เห็นเมนูหลักครบ (ยกเว้น Settings บางส่วนที่ OWNER เท่านั้น)
- [ ] เข้า Reports ได้
- [ ] สร้างใบงานซ่อม / ปิดกะได้
- [ ] **ต้องไม่เห็น** ปุ่มลบ User / แก้ไข Role ของผู้อื่น _(ถ้า policy กำหนด)_

### 1.3 CASHIER
- [ ] เข้าสู่ระบบด้วย credential ของ CASHIER
- [ ] เข้า POS ขายสินค้าได้
- [ ] รับชำระงานซ่อมได้
- [ ] **ต้องไม่เข้า** Reports (Profit) — ควรเห็น 403 หรือซ่อนเมนู
- [ ] **ต้องไม่เข้า** Settings — ควรเห็น 403 หรือซ่อนเมนู
- [ ] **ต้องไม่เห็น** ปุ่ม "ลบใบงาน" หรือ Reverse Payment (ถ้า policy กำหนด)

### 1.4 TECHNICIAN
- [ ] เข้าสู่ระบบด้วย credential ของ TECHNICIAN
- [ ] เห็นรายการงานซ่อมที่ assign ให้ตนเอง
- [ ] อัปเดตสถานะงานซ่อมได้ (DIAGNOSING → IN_PROGRESS → COMPLETED)
- [ ] เพิ่ม Parts ในงานที่รับผิดชอบได้
- [ ] **ต้องไม่เข้า** POS / Reports / Settings

### 1.5 STAFF
- [ ] เข้าสู่ระบบด้วย credential ของ STAFF
- [ ] เข้าดูรายการงานซ่อมได้ (read-only ตาม permission)
- [ ] **ต้องไม่สามารถ** ลบหรือแก้ไขข้อมูลที่ไม่ได้รับอนุญาต
- [ ] ตรวจสอบว่า API ฝั่ง backend return 403 จริง (ไม่ใช่แค่ซ่อน UI)

---

## 2. Daily Frontdesk Flow

### 2.1 เปิดกะ (Open Shift)
- [ ] ไปที่ Shifts / หรือแตะการ์ด "เปิดกะ" ใน SUNMI home
- [ ] เปิดกะใหม่ได้สำเร็จ — เห็น timestamp เปิดกะ
- [ ] กลับหน้าหลัก — การ์ดกะแสดงสถานะ "กะเปิดอยู่" สีเขียว
- [ ] ลองเปิดกะซ้ำ — ต้องได้รับ error "มีกะที่เปิดอยู่แล้ว"

### 2.2 POS ขายสินค้า
- [ ] เข้า `/sunmi/sales` (หรือ `/sales`)
- [ ] สแกน / ค้นหาสินค้าด้วย barcode ได้
- [ ] ค้นหาสินค้าด้วยชื่อได้
- [ ] เพิ่มสินค้าเข้าตะกร้า — จำนวนเพิ่ม/ลดถูกต้อง
- [ ] ยอดรวมคำนวณถูกต้อง (รวม VAT ถ้ามี)
- [ ] เลือกวิธีชำระ: เงินสด / โอนเงิน / บัตร
- [ ] คำนวณเงินทอนถูกต้อง (กรณีเงินสด)
- [ ] กดยืนยัน — บิลถูกบันทึก, สต็อกลด
- [ ] ปุ่ม "พิมพ์ซ้ำ" ใน empty cart แสดงหลังบิลล่าสุด

### 2.3 พิมพ์ใบเสร็จ
- [ ] หลังขาย — เปิด PrinterFlowSheet อัตโนมัติ
- [ ] แสดง Preview ใบเสร็จถูกต้อง (ชื่อร้าน, รายการ, ยอด, วันที่)
- [ ] กด "พิมพ์" — ส่งงานพิมพ์ไปยัง SUNMI printer หรือ popup print
- [ ] กด "แชร์" (ถ้ามี) — ส่ง line / share ได้
- [ ] ปิด sheet — กลับสู่หน้าขายพร้อมใช้งานต่อ

### 2.4 คืนเงิน (Refund)
- [ ] ค้นหาบิลที่ต้องการคืนเงินใน Sales History
- [ ] กด Refund / Reverse
- [ ] ยืนยัน — ยอดถูก reverse, สต็อกถูกคืน
- [ ] บิลเดิมแสดงสถานะ "คืนเงินแล้ว"
- [ ] Audit log บันทึก "REFUND" พร้อมชื่อผู้ทำรายการ

### 2.5 ยกเลิกรายการ (Void)
- [ ] เพิ่มสินค้าในตะกร้า POS
- [ ] กด Void / Clear cart ก่อนยืนยันบิล
- [ ] ตะกร้าว่าง — ไม่มี record ถูกสร้างใน DB
- [ ] กด Void หลังบันทึกบิลแล้ว (ถ้า feature มี) — ต้องมี confirmation dialog

---

## 3. Repair Flow

### 3.1 รับงานซ่อม (Intake)
- [ ] เข้า `/sunmi/repair-intake` หรือ `/repairs/new`
- [ ] ค้นหาลูกค้าเดิมด้วยเบอร์โทร (พิมพ์ 3+ ตัว — auto-search)
- [ ] เลือกลูกค้าเดิมจากผลลัพธ์ — ชื่อ/เบอร์ fill อัตโนมัติ
- [ ] กรณีลูกค้าใหม่ — กรอกชื่อ + เบอร์ด้วยตนเอง
- [ ] เลือก Brand จาก chip — Quick Models แสดงให้เลือก
- [ ] แตะ Quick Model — field "รุ่น" fill อัตโนมัติ
- [ ] กรอก issue, สภาพ, อุปกรณ์เสริม, มัดจำ, ประมาณการ, กำหนดเสร็จ
- [ ] ขั้นตอน Confirm แสดงข้อมูลถูกต้องก่อนบันทึก
- [ ] กด "ยืนยันรับงาน" — ใบงานถูกสร้าง, ticketNumber ถูกกำหนด

### 3.2 เพิ่มรูปถ่าย (Photos)
- [ ] ปุ่ม "ถ่ายรูป" มีขนาดใหญ่พอสำหรับ touch (h-24)
- [ ] กด "ถ่ายรูป" — เปิดกล้องหลัง (capture=environment)
- [ ] กด "เลือกรูป" — เปิด Gallery
- [ ] เพิ่มรูปได้สูงสุด 6 รูป — รูปที่ 7 ไม่สามารถเพิ่มได้
- [ ] ลบรูปแต่ละรูปด้วย X ได้
- [ ] รูปถูก upload พร้อมกับใบงาน (หรือ attach ทีหลัง)
- [ ] ถ้า upload รูปล้มเหลว — ใบงานยังถูกสร้าง, แจ้ง toast error

### 3.3 มอบหมายช่าง (Assign Technician)
- [ ] เข้า Repair Workspace `/repairs/[id]`
- [ ] dropdown ช่างแสดงรายชื่อทั้งหมด (TECHNICIAN / MANAGER / OWNER)
- [ ] เลือกช่าง — บันทึกสำเร็จ, Timeline แสดง event
- [ ] เปลี่ยนช่าง — Timeline แสดง event ใหม่
- [ ] ถ้าไม่มีสิทธิ์ fetch `/users` — dropdown ซ่อน (ไม่ crash)

### 3.4 เพิ่มอะไหล่ (Add Parts)
- [ ] ค้นหาอะไหล่ด้วยชื่อในช่อง search
- [ ] เลือกอะไหล่ — เพิ่มเข้า list พร้อมราคา
- [ ] แก้ไขจำนวนอะไหล่แต่ละรายการ
- [ ] ลบอะไหล่ออกได้
- [ ] Cost Summary อัปเดต (Labor + Parts + Total)
- [ ] เมื่อสถานะ COMPLETED / DELIVERED — ปุ่ม Add/Remove Parts ถูก lock

### 3.5 รับชำระ (Payment)
- [ ] สถานะต้องเป็น COMPLETED ก่อนรับชำระ
- [ ] กด "รับชำระ" — Payment dialog เปิด
- [ ] เลือกวิธีชำระ: เงินสด / โอนเงิน / บัตร
- [ ] กดยืนยัน — สถานะเปลี่ยนเป็น DELIVERED, paymentStatus = PAID
- [ ] Timeline แสดง paidAt / deliveredAt
- [ ] ใบเสร็จถูก generate และ PrinterFlowSheet เปิด

### 3.6 ประกัน (Warranty)
- [ ] หลัง DELIVERED — แสดง warranty expiry (ถ้ามี)
- [ ] ลูกค้านำอุปกรณ์กลับมาในช่วงประกัน — สร้างใบงานใหม่ link กัน (ถ้า feature มี)
- [ ] แสดง "อยู่ในประกัน" / "หมดประกันแล้ว" ถูกต้อง

### 3.7 ส่งมอบ (Delivery)
- [ ] DELIVERED เกิดขึ้น **เฉพาะ** เมื่อรับชำระผ่าน Payment endpoint เท่านั้น
- [ ] Status dropdown **ต้องไม่มี** ตัวเลือก DELIVERED โดยตรง
- [ ] หลัง DELIVERED — ใบงานแสดง badge "ส่งมอบแล้ว"
- [ ] ค้นหาในหน้า Repairs — filter "DELIVERED" แสดงใบงานนี้

### 3.8 พิมพ์ใบรับซ่อม (Print Repair Slip)
- [ ] หลัง intake สำเร็จ — PrinterFlowSheet เปิดอัตโนมัติ
- [ ] Preview แสดง: ชื่อร้าน, เลขใบงาน, ชื่อลูกค้า, อุปกรณ์, อาการ, มัดจำ, กำหนดเสร็จ
- [ ] กด "พิมพ์" — ส่งไป SUNMI printer / popup
- [ ] ปุ่ม "พิมพ์ซ้ำ" ใน Repair Workspace ทำงานได้
- [ ] ปุ่มนำทางหลังพิมพ์: ดูรายการ / รับงานใหม่ / หน้าหลัก

---

## 4. Debt Flow (หนี้ค้างชำระ)

### 4.1 ชำระบางส่วน (Partial Payment)
- [ ] เข้า `/debt` — เห็นรายการ PARTIAL / PENDING
- [ ] แตะ "รับชำระ" บนใบงาน
- [ ] กด Quick Amount "ครึ่ง" — amount fill = 50% ของยอดคงเหลือ
- [ ] ยืนยัน — paymentStatus เปลี่ยนเป็น PARTIAL
- [ ] ยอดคงเหลือลดลงถูกต้อง
- [ ] ประวัติการชำระแสดงรายการใหม่

### 4.2 ชำระครบ (Full Payment)
- [ ] กด Quick Amount "ครบ" — amount fill = ยอดคงเหลือทั้งหมด
- [ ] ข้อความ "✓ ชำระครบทั้งหมด" แสดง
- [ ] ยืนยัน — paymentStatus เปลี่ยนเป็น PAID
- [ ] ใบงานหายออกจากหน้า Debt (ไม่มีหนี้แล้ว)
- [ ] Summary chip "ยังไม่ชำระ" / "ชำระบางส่วน" อัปเดต

### 4.3 พิมพ์ใบเสร็จหนี้
- [ ] หลังชำระสำเร็จ — ReceiptModal เปิดอัตโนมัติ
- [ ] ใบเสร็จแสดง: เลขที่, วันที่, ลูกค้า, ใบงาน, อุปกรณ์, ยอดรับ, วิธีชำระ, ยอดคงเหลือ
- [ ] กด "พิมพ์ใบเสร็จ" — popup print เปิด
- [ ] ปิด modal — กลับหน้า Debt ได้ปกติ

---

## 5. Stock Management

### 5.1 ปรับสต็อก (Adjustment)
- [ ] เข้า Stock > เลือกสินค้า
- [ ] กด Adjust — ใส่จำนวน + / − + เหตุผล
- [ ] ยืนยัน — สต็อกอัปเดต
- [ ] Audit log บันทึก adjustment พร้อมผู้ทำรายการ
- [ ] ลองปรับให้ต่ำกว่า 0 — ต้องได้รับ error

### 5.2 โอนย้ายสาขา (Transfer Branch)
- [ ] เลือกสินค้า > Transfer
- [ ] เลือก branch ปลายทาง + จำนวน
- [ ] ยืนยัน — สต็อก branch ต้นลด, branch ปลายเพิ่ม
- [ ] ตรวจสอบ branch ต้นทาง: สต็อกลดถูกต้อง
- [ ] ตรวจสอบ branch ปลายทาง: สต็อกเพิ่มถูกต้อง
- [ ] ลองโอนจำนวนมากกว่าที่มี — ต้องได้รับ error

### 5.3 แจ้งเตือน Low Stock
- [ ] ตั้ง reorder point ของสินค้า
- [ ] ปรับสต็อกให้ต่ำกว่า reorder point
- [ ] Notification badge (Bell icon) แสดงจำนวนแจ้งเตือน
- [ ] เข้า `/notifications` — เห็นแจ้งเตือน low stock
- [ ] หน้า Stock แสดง badge / highlight สินค้าที่ต่ำกว่า threshold

---

## 6. Reports

### 6.1 สรุปปิดวัน (Daily Closing)
- [ ] เข้า `/sunmi/daily-summary` (OWNER/MANAGER เท่านั้น)
- [ ] แสดงรายได้วันนี้: POS + งานซ่อม + รวม
- [ ] แสดงจำนวนบิล, งานซ่อมที่สร้าง/ปิด
- [ ] แสดงค่าใช้จ่าย (Expenses) ที่บันทึกวันนี้
- [ ] แสดงแจ้งเตือนที่ค้างอยู่
- [ ] CASHIER / TECHNICIAN เข้าไม่ได้ — redirect หรือ 403

### 6.2 Profit Report
- [ ] เข้า Reports > Profit (OWNER/MANAGER เท่านั้น)
- [ ] เลือกช่วงวันที่ — ข้อมูลโหลดถูกต้อง
- [ ] ยอดรายได้ตรงกับ Daily Closing ของวันที่เลือก
- [ ] แสดง Cost of Goods / Net Profit ถูกต้อง

### 6.3 Branch Filter
- [ ] เลือก Branch ใน filter — ข้อมูลเปลี่ยนตาม branch
- [ ] OWNER เห็นได้ทุก branch
- [ ] MANAGER เห็นเฉพาะ branch ที่ตนสังกัด (ถ้า policy กำหนด)
- [ ] การ์ดสรุปอัปเดตตาม branch ที่เลือก

---

## 7. Security

### 7.1 Branch Scoping
- [ ] User ของ Branch A ไม่เห็นข้อมูล Branch B ใน API response
- [ ] เปลี่ยน `branchId` ใน request โดยตรง — ต้องได้รับ 403
- [ ] Repair ของ Branch A ไม่ปรากฏใน Branch B
- [ ] Stock ของแต่ละ branch แยกกันถูกต้อง

### 7.2 Role Permission Blocking
- [ ] CASHIER เรียก `DELETE /repairs/:id` โดยตรง — ต้องได้รับ 403
- [ ] TECHNICIAN เรียก `GET /reports/profit` โดยตรง — ต้องได้รับ 403
- [ ] STAFF เรียก `POST /users` โดยตรง — ต้องได้รับ 403
- [ ] Token หมดอายุ — ต้อง redirect ไป `/login` อัตโนมัติ
- [ ] ใช้ token ของ User A เรียกข้อมูล User B — ต้องได้รับ 403

### 7.3 Audit Log
- [ ] ทำรายการ Payment — บันทึก log พร้อม userId, timestamp, amount
- [ ] ทำรายการ Refund / Reverse — บันทึก log
- [ ] ปรับสต็อก — บันทึก log
- [ ] เพิ่ม/แก้ไข User — บันทึก log
- [ ] ดู Audit Log ใน Admin panel — แสดงรายการถูกต้อง
- [ ] Log ไม่สามารถลบได้จาก UI ปกติ

---

## 8. Backup

### 8.1 สร้าง Backup
- [ ] ไปที่ Settings > Backup (OWNER เท่านั้น)
- [ ] กด "สร้าง Backup" — กระบวนการทำงานโดยไม่ error
- [ ] แสดง progress / loading ระหว่างสร้าง
- [ ] แสดงข้อความสำเร็จพร้อมชื่อไฟล์และเวลา

### 8.2 ตรวจสอบไฟล์ Backup
- [ ] ไฟล์ backup อยู่ใน path ที่กำหนด (เช่น `/backups/`)
- [ ] ขนาดไฟล์ > 0 bytes
- [ ] ชื่อไฟล์มี timestamp ถูกต้อง
- [ ] สามารถ restore จากไฟล์ backup ในสภาพแวดล้อม TEST ได้ _(ทำใน DEV เท่านั้น)_

---

## 9. SUNMI / Mobile

### 9.1 Mobile POS
- [ ] เข้า `/sunmi/sales` บนหน้าจอ SUNMI
- [ ] บาร์โค้ด input auto-focus เมื่อเปิดหน้า
- [ ] แตะสินค้าจาก grid — เพิ่มเข้าตะกร้าทันที
- [ ] ปุ่ม + / − บนสินค้าขนาดใหญ่พอสำหรับนิ้ว
- [ ] Sticky cart แสดงยอดรวมอยู่ตลอด
- [ ] กด "คิดเงิน" — checkout ทำงานได้
- [ ] ใบเสร็จพิมพ์ได้ / ปุ่ม "พิมพ์ซ้ำ" ทำงาน
- [ ] Bottom nav ทำงานถูกต้อง: หน้าหลัก / ขาย / งานซ่อม / หนี้ / แจ้งเตือน

### 9.2 Repair Intake (SUNMI)
- [ ] เข้า `/sunmi/repair-intake`
- [ ] Step bar แสดง 5 ขั้นตอน
- [ ] ค้นหาลูกค้า auto-search เมื่อพิมพ์ 3+ ตัว
- [ ] เลือก Brand — Quick Models chip แสดง
- [ ] แตะ Quick Model — field รุ่น fill ทันที
- [ ] ปุ่ม "ถ่ายรูป" / "เลือกรูป" ขนาดใหญ่ (h-24)
- [ ] กดปุ่ม "ยืนยันรับงาน" — ใบงานถูกสร้าง
- [ ] PrinterFlowSheet เปิดอัตโนมัติหลังบันทึก

### 9.3 Debt Payment (SUNMI)
- [ ] เข้า `/debt` — เห็นรายการหนี้ค้าง
- [ ] แตะ "รับชำระ" — modal เปิด
- [ ] Quick Amount "ครบ" fill ยอดเต็ม
- [ ] Quick Amount "ครึ่ง" fill 50%
- [ ] ช่อง custom input พิมพ์จำนวนเองได้
- [ ] ปุ่ม "รับชำระ" ขนาดใหญ่ (h-14) — แตะง่าย
- [ ] ยืนยัน — ReceiptModal เปิด, ใบเสร็จพิมพ์ได้

---

## สรุป Pass/Fail

| หมวด | รายการ | ผ่าน | ไม่ผ่าน | หมายเหตุ |
|------|--------|------|---------|---------|
| 1. Login by Role | 5 roles | | | |
| 2. Daily Frontdesk | Open Shift / POS / Print / Refund / Void | | | |
| 3. Repair Flow | Intake / Photos / Assign / Parts / Pay / Warranty / Delivery / Print | | | |
| 4. Debt Flow | Partial / Full / Print | | | |
| 5. Stock | Adjust / Transfer / Low Stock | | | |
| 6. Reports | Daily / Profit / Branch | | | |
| 7. Security | Branch Scope / Role Block / Audit | | | |
| 8. Backup | Create / Verify | | | |
| 9. SUNMI | POS / Intake / Debt | | | |

---

> **⚠ DEV ONLY** — ห้ามรัน checklist นี้กับ Production database โดยเด็ดขาด

# แจ้งเตือนบนหน้าจอล็อก (Push) ในแอป Android

โค้ดพร้อมแล้ว ทั้งในแอป (ลงทะเบียนมือถือ), หลังบ้าน (ส่งผ่าน Firebase) และ workflow ที่ build แอป
ที่ยังไม่ทำงาน (`push_devices = 0`) เพราะยังไม่ได้ใส่ค่าตั้ง Firebase 2 ตัว

## ตั้งค่าครั้งเดียว (เจ้าของระบบทำเอง)

1. ไปที่ https://console.firebase.google.com แล้วสร้างโปรเจกต์ (ฟรี)
2. เพิ่มแอป Android 2 ตัว ใช้ package name
   - `com.fixitpro.pos` (FixITPro POS / Sunmi)
   - `com.fixitpro.staff` (FixITPro Staff)
3. ดาวน์โหลด `google-services.json` ไฟล์เดียวที่มีทั้ง 2 แอป
4. GitHub → Settings → Secrets → Actions → เพิ่ม `GOOGLE_SERVICES_JSON` = เนื้อหาไฟล์ทั้งไฟล์
5. Firebase → Project settings → Service accounts → Generate new private key จะได้ไฟล์ JSON
6. Coolify → แอป FixITPro (backend) → Environment Variables → เพิ่ม `FIREBASE_SERVICE_ACCOUNT` = เนื้อหาไฟล์นั้น
   (จะใส่เป็น JSON ตรงๆ หรือเข้ารหัส base64 ก็ได้) แล้ว Redeploy
7. รัน Actions → "Android apps (POS + Staff)" เพื่อ build แอปใหม่ ใน log จะเห็น `lock-screen notifications ON`
8. ให้ร้านติดตั้งแอปใหม่จากหน้า /downloads แล้วล็อกอิน แอปจะขออนุญาตแจ้งเตือนครั้งแรก

ตรวจผลได้จาก restore-drill ข้อ 17 ตัวเลข `push_devices` ควรมากกว่า 0

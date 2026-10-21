# สำรองข้อมูลไปเก็บนอกเซิร์ฟเวอร์ (Off-site backup)

ทุกคืน 03:30 (เวลาไทย) เซิร์ฟเวอร์สำรองฐานข้อมูลไว้ที่ `/opt/fixitpro-backups/db` ไฟล์นี้อยู่บนเครื่องเดียวกับระบบ
ถ้าเซิร์ฟเวอร์เสียหรือถูกลบ ไฟล์สำรองก็หายไปด้วย ขั้นตอนนี้จะส่งสำเนาที่ **เข้ารหัสแล้ว** ไปเก็บที่อื่นทุกคืน

## ตั้งค่าครั้งเดียว (เจ้าของระบบทำเอง)

1. เลือกที่เก็บที่ rclone รองรับ เช่น Google Drive, Cloudflare R2, Backblaze B2 หรือ S3
2. ติดตั้ง rclone บนเครื่องตัวเอง แล้วรัน `rclone config` เพื่อสร้าง remote เช่นชื่อ `offsite`
3. เปิดไฟล์ config ที่ได้ (`rclone config file` จะบอกที่อยู่ไฟล์) แล้วคัดลอกเนื้อหาทั้งไฟล์
4. ที่ GitHub → Settings → Secrets and variables → Actions → New repository secret ให้เพิ่ม 3 ตัว
   - `OFFSITE_RCLONE_CONF`: เนื้อหาไฟล์ rclone.conf ทั้งไฟล์
   - `OFFSITE_REMOTE`: ปลายทาง เช่น `offsite:fixitpro-backups`
   - `OFFSITE_PASSPHRASE`: รหัสผ่านยาวๆ สำหรับเข้ารหัสไฟล์สำรอง **จดเก็บไว้ที่ปลอดภัย** ถ้าลืมรหัสนี้จะเปิดไฟล์สำรองไม่ได้
5. รัน Actions → "Backup restore drill" โดยติ๊ก `backup_first` ระบบจะติดตั้ง rclone บนเซิร์ฟเวอร์ แล้วส่งสำเนาชุดแรกขึ้นไป
   ขั้นตอน "Off-site backup copy" จะแสดงรายชื่อไฟล์ที่อยู่ปลายทาง

ปลายทางจะเก็บสำเนาไว้ 30 วัน ถ้าต้องการเปลี่ยน ให้เพิ่ม `OFFSITE_KEEP_DAYS=60` ในไฟล์ `/opt/fixitpro-backups/offsite.env`

## เปิดไฟล์สำรองที่เข้ารหัส

```bash
rclone --config rclone.conf copy offsite:fixitpro-backups/fixitpro_YYYYMMDD_HHMMSS.sql.gz.enc .
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in fixitpro_YYYYMMDD_HHMMSS.sql.gz.enc \
  -out fixitpro_YYYYMMDD_HHMMSS.sql.gz      # ถามรหัส OFFSITE_PASSPHRASE
sha256sum -c fixitpro_YYYYMMDD_HHMMSS.sql.gz.sha256   # ตรวจว่าไฟล์ไม่เสีย
```

หลังจากนั้นกู้คืนได้ตาม `docs/disaster-recovery.md`

## ถ้าส่งไม่สำเร็จ

ไฟล์สำรองในเซิร์ฟเวอร์ยังอยู่ครบ ระบบแค่บันทึกว่า `ERROR: off-site copy failed` ไว้ใน `/opt/fixitpro-backups/backup.log`

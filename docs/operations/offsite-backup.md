# สำรองข้อมูลไปเก็บนอกเซิร์ฟเวอร์ (Off-site backup)

ทุกคืน 03:30 (เวลาไทย) เซิร์ฟเวอร์สำรองฐานข้อมูลไว้ที่ `/opt/fixitpro-backups/db` ไฟล์นี้อยู่บนเครื่องเดียวกับระบบ
ถ้าเซิร์ฟเวอร์เสียหรือถูกลบ ไฟล์สำรองก็หายไปด้วย ขั้นตอนนี้จะส่งสำเนาที่ **เข้ารหัสแล้ว** ไปเก็บที่อื่นทุกคืน

## สำเนาที่ GitHub เก็บให้ (ใช้ได้ทันที ไม่ต้องสมัครอะไร)

ทุกคืน 03:45 (เวลาไทย) workflow "Backup restore drill" จะดึงไฟล์สำรองล่าสุดจากเซิร์ฟเวอร์ ตรวจ checksum
เข้ารหัส AES-256 แล้วลองถอดรหัสกลับว่าได้ไฟล์เดิม จากนั้นเก็บเป็น artifact ชื่อ `db-fixitpro_YYYYMMDD_HHMMSS.sql.gz`
ไว้ 7 วัน (ดูได้ที่ GitHub → Actions → Backup restore drill → รันล่าสุด → Artifacts)

- กุญแจเข้ารหัส: ถ้ามี secret `OFFSITE_PASSPHRASE` ใช้ตัวนั้น (แนะนำ ตั้งแล้วจดเก็บไว้ จะเปิดไฟล์เองได้)
  ถ้าไม่มี ใช้ค่า sha256 ของ secret `DEPLOY_SSH_KEY` — คนอ่านค่านี้ไม่ได้ ถอดรหัสได้เฉพาะใน workflow
  และถ้าเปลี่ยน deploy key ไฟล์เก่าจะเปิดไม่ได้ (ไฟล์เก่าหมดอายุใน 7 วันอยู่แล้ว)
- เปิดไฟล์เอง (กรณีใช้ OFFSITE_PASSPHRASE):

```bash
unzip db-fixitpro_YYYYMMDD_HHMMSS.sql.gz.zip
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in fixitpro_YYYYMMDD_HHMMSS.sql.gz.enc \
  -out fixitpro_YYYYMMDD_HHMMSS.sql.gz            # ถามรหัส OFFSITE_PASSPHRASE
sha256sum -c fixitpro_YYYYMMDD_HHMMSS.sql.gz.sha256
```

## เก็บนานกว่า 7 วัน: ที่เก็บภายนอก (ตั้งค่าครั้งเดียว เจ้าของระบบทำเอง)

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

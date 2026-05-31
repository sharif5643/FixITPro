# FixITPro — New Shop Onboarding Guide

Step-by-step guide for setting up FixITPro for a new mobile phone shop.

---

## Overview

The onboarding flow is:

1. Deploy the system (VPS + domain)
2. Create the OWNER account
3. Configure shop basics (categories, products, suppliers)
4. Create staff accounts with correct roles
5. Train staff
6. Go live

---

## Step 1: Deploy the System

Follow [PRODUCTION.md](./PRODUCTION.md) completely. Come back here once the system is live and `validate.sh` passes.

---

## Step 2: Create the Owner Account

The database seed creates a default owner. Change its credentials immediately after first login.

### Option A: Use Seed (Development / Fresh Install)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec backend npx prisma db seed
```

Default seed credentials (change immediately):
- Email: `owner@fixitpro.local`
- Password: `Owner@1234`

### Option B: Create Owner via Admin Script

```bash
# On the VPS, open a psql session
bash scripts/admin.sh reset-password owner@yourshop.com
```

Or create directly via the API (run from server):

```bash
source .env.prod
TOKEN=$(curl -s -X POST https://api.yourdomain.com/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@fixitpro.local","password":"Owner@1234"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# Update owner profile
curl -s -X PUT https://api.yourdomain.com/api/v1/auth/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@yourshop.com","name":"ชื่อเจ้าของร้าน","password":"NewStrongPassword!1"}'
```

---

## Step 3: Configure Shop Basics

Log in to `https://app.yourdomain.com` as OWNER.

### 3.1 Create Category Types and Categories

Go to **Settings → Categories**.

Suggested structure for a phone shop:

| Type (ประเภท) | Categories (หมวดหมู่) |
|--------------|----------------------|
| สินค้า | มือถือ, แท็บเล็ต, อุปกรณ์เสริม, อะไหล่ |
| บริการ | ซ่อมหน้าจอ, ซ่อมแบตเตอรี่, ปลดล็อก, อื่นๆ |

### 3.2 Add Products

Go to **Products → Add Product**.

For each product set:
- Name, SKU, price, cost
- Category
- Initial stock quantity
- Type: `PRODUCT` (physical) or `SERVICE`

For phones with serial numbers, enable "ติดตาม Serial Number".

### 3.3 Add Suppliers

Go to **Suppliers → Add Supplier**.

Add your main phone distributors and parts suppliers with contact info.

---

## Step 4: Create Staff Accounts

Go to **Employees → Add Employee**.

### Role Guide

| Role | Thai | Use For |
|------|------|---------|
| OWNER | เจ้าของ | Shop owner only — full access, cannot be disabled |
| MANAGER | ผู้จัดการ | Shift manager — all features except system settings |
| CASHIER | แคชเชียร์ | Front counter — POS, basic product view |
| TECHNICIAN | ช่างซ่อม | Repair technician — repair workflow, serial numbers |
| STOCK_STAFF | พนักงานสต็อก | Warehouse — purchasing, stock, serials |

### Default Permissions per Role

| Feature | MANAGER | CASHIER | TECHNICIAN | STOCK_STAFF |
|---------|---------|---------|------------|-------------|
| ดูสินค้า | ✓ | ✓ | ✓ | ✓ |
| เพิ่ม/แก้ไขสินค้า | ✓ | — | — | ✓ |
| POS / ขายสินค้า | ✓ | ✓ | — | — |
| ส่วนลด | ✓ | ✓ | — | — |
| ดูยอดขาย | ✓ | — | — | — |
| ซ่อม | ✓ | — | ✓ | — |
| สต็อก | ✓ | — | — | ✓ |
| ใบสั่งซื้อ | ✓ | — | — | ✓ |
| Serial Numbers | ✓ | — | ✓ | ✓ |
| รายงาน | ✓ | — | — | — |
| ตั้งค่าระบบ | — | — | — | — |

Customize at **Roles & Permissions** (OWNER only).

### Creating a Staff Account

1. Go to **Employees → Add Employee**
2. Fill: name, email, role, initial password
3. Employee receives credentials — must change password on first login

---

## Step 5: Configure Subscription

The system includes a Subscription model. Set the expiry date:

```bash
bash scripts/admin.sh subscription-status
bash scripts/admin.sh extend-subscription 365   # 1 year
```

Or update directly via admin SQL:

```bash
bash scripts/admin.sh
```

---

## Step 6: Opening Shift Training

Teach staff the daily workflow:

### Morning (Open Shift)
1. Log in → go to **Shifts**
2. Click **เปิดกะ** (Open Shift)
3. Count cash in drawer → enter opening balance
4. Ready to sell

### During the Day
- POS: **Sales → New Sale**
- Repair intake: **Repairs → New Repair**
- Walk-in purchase: use POS with SERVICE type product

### Evening (Close Shift)
1. Go to **Shifts → Current Shift**
2. Click **ปิดกะ** (Close Shift)
3. Count cash → enter closing balance
4. System records shift summary (sales, repairs, discounts)

---

## Step 7: Data Migration (Existing Shop)

If the shop is migrating from another system (Excel, paper, previous POS):

### Products

Prepare a CSV with columns: `name, sku, price, cost, stock, category`

Import via a temporary script (run on server):

```bash
# Place your CSV at /tmp/products.csv on the server
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T backend node -e "
    const { PrismaClient } = require('@prisma/client');
    const fs = require('fs');
    const prisma = new PrismaClient();
    // parse CSV and insert — customize as needed
  "
```

For large catalogs, contact the developer for a bulk import script.

### Customers / Repair History

Repair history can be entered manually or imported in bulk. Each repair entry needs: customer name, phone, device info, issue, status.

### Financial Data

Historical sales data is typically not imported — start fresh from the go-live date and keep the old records in the previous system for reference.

---

## Step 8: Go-Live Checklist

- [ ] System passes `bash scripts/validate.sh`
- [ ] OWNER password changed from default
- [ ] All staff accounts created with correct roles
- [ ] Categories and products entered
- [ ] Suppliers added
- [ ] At least one test sale and repair created + deleted (or use a test shift)
- [ ] Staff trained on open/close shift
- [ ] Backup verified: `bash scripts/admin.sh backup-now`
- [ ] Emergency contacts documented in [EMERGENCY.md](./EMERGENCY.md)
- [ ] Shop owner has emergency admin script access

---

## Ongoing Administration

### Add New Staff
**Employees → Add Employee** (OWNER or MANAGER)

### Remove Staff
**Employees** → Toggle off (MANAGER or OWNER). Account is deactivated, data is preserved.

### Adjust Permissions
**Roles & Permissions** (OWNER only) — toggle per permission per role.

### Extend Subscription
```bash
bash scripts/admin.sh extend-subscription 365
```

### Backup Schedule
Automated backups run daily at 2 AM (configured by `server-setup.sh`). Verify:
```bash
crontab -l -u appuser
ls -lh /home/appuser/fixitpro/backups/
```

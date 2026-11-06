/**
 * The lists a repair is taken in with — one set for the web form, the staff app and the SUNMI
 * screen, so a job records the same words whichever device took it in.
 *
 * What is offered follows the kind of device: a notebook has a keyboard and a hinge, a printer
 * has paper jams and ink, a phone has a camera and a SIM. Anything chosen is kept even if the
 * device type changes afterwards, so nothing typed in is lost.
 */

/** Tags shown apart from the job types: urgent and warranty-claim jobs. */
export const SPECIAL_ISSUE_TAGS = ['ด่วน', 'เคลม']

export const DEVICE_TYPE_OPTIONS = ['มือถือ', 'แท็บเล็ต', 'แล็ปท็อป', 'คอมพิวเตอร์ตั้งโต๊ะ', 'ปริ้นเตอร์', 'Smart Watch', 'อื่นๆ']

type Family = 'phone' | 'computer' | 'printer' | 'other'

/** Which set of lists a device type uses */
export function deviceFamily(type?: string | null): Family {
  switch (type) {
    case 'แล็ปท็อป':
    case 'คอมพิวเตอร์ตั้งโต๊ะ':
      return 'computer'
    case 'ปริ้นเตอร์':
      return 'printer'
    case 'อื่นๆ':
      return 'other'
    default:
      return 'phone'     // มือถือ, แท็บเล็ต, Smart Watch, or not picked yet
  }
}

const ISSUES: Record<Family, string[]> = {
  phone: [
    'หน้าจอ', 'แบตเตอรี่', 'กล้อง', 'ชาร์จไม่เข้า', 'เสียง', 'ปุ่มเสีย',
    'WiFi', 'Bluetooth', 'ไม่ติด', 'ค้าง/รีสตาร์ท', 'ตก/หล่น', 'น้ำเข้า', 'สัมผัสไม่ได้', 'อื่นๆ',
  ],
  computer: [
    'เปิดไม่ติด', 'จอ/ภาพไม่ขึ้น', 'คีย์บอร์ด', 'ทัชแพด', 'แบตเตอรี่', 'ชาร์จไม่เข้า', 'ช้า/ค้าง',
    'ลง Windows/โปรแกรม', 'ฮาร์ดดิสก์/SSD', 'เพิ่ม RAM', 'ร้อน/พัดลมดัง', 'บานพับ', 'WiFi', 'ไวรัส',
    'กู้ข้อมูล', 'น้ำเข้า', 'อื่นๆ',
  ],
  printer: [
    'กระดาษติด', 'ไม่ดึงกระดาษ', 'หมึก/ตลับ', 'หัวพิมพ์ตัน', 'พิมพ์ไม่ออก', 'สีเพี้ยน/เป็นเส้น',
    'ไฟกะพริบ/Error', 'ซับหมึกเต็ม', 'ต่อ WiFi/ไดรเวอร์', 'สแกนไม่ได้', 'เปิดไม่ติด', 'อื่นๆ',
  ],
  other: ['เปิดไม่ติด', 'ใช้งานไม่ได้', 'ชาร์จไม่เข้า', 'ตก/หล่น', 'น้ำเข้า', 'อื่นๆ'],
}

const CONDITIONS: Record<Family, string[]> = {
  phone: ['หน้าจอแตก', 'ฝาหลังแตก', 'ขอบมีรอย', 'มีรอยขีดข่วน', 'ปกติ', 'เปียกน้ำ'],
  computer: ['หน้าจอแตก', 'บานพับหัก', 'ปุ่มคีย์บอร์ดหาย', 'ฝาบุบ/แตก', 'มีรอยขีดข่วน', 'น็อตหาย', 'ปกติ', 'เปียกน้ำ'],
  printer: ['ฝาแตก', 'ถาดกระดาษหัก', 'มีหมึกเลอะ', 'มีรอยขีดข่วน', 'ปกติ'],
  other: ['แตก', 'มีรอยขีดข่วน', 'ปกติ', 'เปียกน้ำ'],
}

const ACCESSORIES: Record<Family, string[]> = {
  phone: [
    'ซิม', 'เมมโมรี่การ์ด', 'เคส', 'ซองใส่', 'สาย USB', 'สายชาร์จ', 'หัวชาร์จ', 'หูฟัง',
    'ฟิล์มกระจก', 'กล่องเดิม', 'ปากกา', 'อื่นๆ',
  ],
  computer: ['อะแดปเตอร์/สายชาร์จ', 'กระเป๋า', 'เมาส์', 'แฟลชไดรฟ์', 'ฮาร์ดดิสก์นอก', 'สายไฟ AC', 'กล่องเดิม', 'อื่นๆ'],
  printer: ['สายไฟ AC', 'สาย USB', 'ตลับหมึก/ขวดหมึก', 'ถาดกระดาษ', 'กล่องเดิม', 'อื่นๆ'],
  other: ['สายชาร์จ', 'หัวชาร์จ', 'สาย USB', 'กล่องเดิม', 'อื่นๆ'],
}

export const issueTagsFor = (type?: string | null) => ISSUES[deviceFamily(type)]
export const conditionsFor = (type?: string | null) => CONDITIONS[deviceFamily(type)]
export const accessoriesFor = (type?: string | null) => ACCESSORIES[deviceFamily(type)]

/** A list for this device type, plus anything already picked from another list (never hidden) */
export const withPicked = (list: string[], picked: string[] = []) => [...list, ...picked.filter((p) => !list.includes(p))]

/** Repair type tags picked at intake (phones); also offered as commission job types. */
export const ISSUE_TAG_OPTIONS = ISSUES.phone

/** Every job type of every device kind: what a shop can set commission for */
export const ALL_ISSUE_TAGS = Array.from(new Set(Object.values(ISSUES).flat()))

/** Condition of the device when it came in (phones). */
export const CONDITION_OPTIONS_LIST = CONDITIONS.phone

/** What the customer left with the device (phones). */
export const ACCESSORY_OPTIONS = ACCESSORIES.phone

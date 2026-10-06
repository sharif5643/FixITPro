/**
 * The lists a repair is taken in with — one set for the web form, the staff app and the SUNMI
 * screen, so a job records the same words whichever device took it in.
 */

/** Repair type tags picked at intake; also the job types a shop can set commission for. */
export const ISSUE_TAG_OPTIONS = [
  'หน้าจอ', 'แบตเตอรี่', 'กล้อง', 'ชาร์จไม่เข้า', 'เสียง', 'ปุ่มเสีย',
  'WiFi', 'Bluetooth', 'ไม่ติด', 'ค้าง/รีสตาร์ท', 'ตก/หล่น', 'น้ำเข้า', 'สัมผัสไม่ได้', 'อื่นๆ',
]

/** Tags shown apart from the job types: urgent and warranty-claim jobs. */
export const SPECIAL_ISSUE_TAGS = ['ด่วน', 'เคลม']

export const DEVICE_TYPE_OPTIONS = ['มือถือ', 'แท็บเล็ต', 'แล็ปท็อป', 'Smart Watch', 'อื่นๆ']

/** Condition of the device when it came in. */
export const CONDITION_OPTIONS_LIST = ['หน้าจอแตก', 'ฝาหลังแตก', 'ขอบมีรอย', 'มีรอยขีดข่วน', 'ปกติ', 'เปียกน้ำ']

/** What the customer left with the device. */
export const ACCESSORY_OPTIONS = [
  'ซิม', 'เมมโมรี่การ์ด', 'เคส', 'ซองใส่', 'สาย USB', 'สายชาร์จ', 'หัวชาร์จ', 'หูฟัง',
  'ฟิล์มกระจก', 'กล่องเดิม', 'ปากกา', 'อื่นๆ',
]

/**
 * Theme sets a shop can pick. "original" is the product's own look and changes nothing; every
 * other set swaps the CSS variables in app/globals.css, so all of the app follows it:
 *  - primary   — Tailwind's blue scale (buttons, tabs, links, badges, charts) and shadcn primary
 *  - second    — gradient partner for the menu header and the SUNMI header
 *  - accent    — the staff app's yellow (FAB, main buttons, highlights)
 *  - side*     — the web side menu
 * Status colours (green paid, red owed, amber warning) are never touched.
 */
export interface ThemeSet {
  key: string
  name: string
  desc: string
  primary: string
  second: string
  accent: string
  side: string
  sideText: string
  sideActive: string
}

export const ORIGINAL_THEME = 'original'

export const THEME_SETS: ThemeSet[] = [
  { key: 'ocean',    name: 'Ocean Blue — มหาสมุทร',      desc: 'น้ำเงิน + ฟ้า + เหลืองทอง',      primary: '#2563eb', second: '#06b6d4', accent: '#fbbf24', side: '#ffffff', sideText: '#334155', sideActive: '#2563eb' },
  { key: 'royal',    name: 'Royal Purple — ม่วงทอง',     desc: 'ม่วงเข้ม + ชมพูม่วง + ทอง',     primary: '#7c3aed', second: '#c026d3', accent: '#f59e0b', side: '#2e1065', sideText: '#ddd6fe', sideActive: '#7c3aed' },
  { key: 'emerald',  name: 'Emerald — มรกต',             desc: 'เขียวมรกต + เขียวอมฟ้า + ส้มอ่อน', primary: '#059669', second: '#0d9488', accent: '#fb923c', side: '#022c22', sideText: '#a7f3d0', sideActive: '#059669' },
  { key: 'sunset',   name: 'Sunset — พระอาทิตย์ตก',     desc: 'ส้ม + ชมพูกุหลาบ + ม่วง',         primary: '#ea580c', second: '#e11d48', accent: '#7c3aed', side: '#ffffff', sideText: '#44403c', sideActive: '#ea580c' },
  { key: 'midnight', name: 'Midnight — ราตรี',           desc: 'น้ำเงินคราม + ฟ้า + เมนูดำ',       primary: '#4f46e5', second: '#0ea5e9', accent: '#22d3ee', side: '#0f172a', sideText: '#cbd5e1', sideActive: '#4f46e5' },
  { key: 'rose',     name: 'Rose Gold — โรสโกลด์',      desc: 'ชมพูกุหลาบ + พีช + ทองแดง',      primary: '#db2777', second: '#fb7185', accent: '#d97706', side: '#500724', sideText: '#fbcfe8', sideActive: '#db2777' },
  { key: 'coral',    name: 'Teal Coral — ทะเลปะการัง',  desc: 'เขียวน้ำทะเล + ปะการัง + เหลือง', primary: '#0d9488', second: '#0891b2', accent: '#f97366', side: '#ffffff', sideText: '#334155', sideActive: '#0d9488' },
  { key: 'graphite', name: 'Graphite Lime — กราไฟต์',   desc: 'ดำเทา + เขียวมะนาว',              primary: '#18181b', second: '#3f3f46', accent: '#a3e635', side: '#09090b', sideText: '#d4d4d8', sideActive: '#a3e635' },
]

/** For pickers: the original look first, then the sets. */
export const THEME_CHOICES: { key: string; name: string; desc: string; swatch: string[] }[] = [
  { key: ORIGINAL_THEME, name: 'Original — แบบเดิมของระบบ', desc: 'หน้าตาเดิมทุกอย่าง (เว็บน้ำเงิน · Staff เหลือง)', swatch: ['#2563eb', '#1d4ed8', '#ffc107', '#ffffff'] },
  ...THEME_SETS.map((t) => ({ key: t.key, name: t.name, desc: t.desc, swatch: [t.primary, t.second, t.accent, t.side] })),
]

export function findThemeSet(key: string | null | undefined): ThemeSet | null {
  return THEME_SETS.find((t) => t.key === key) ?? null
}

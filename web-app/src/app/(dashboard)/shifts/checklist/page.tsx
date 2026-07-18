'use client'

import { useState, useRef } from 'react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Printer, RotateCcw, Sun, Moon } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Checklist data ─────────────────────────────────────────────────────────────

const OPENING_CHECKS = [
  { id: 'o1',  label: 'นับเงินสดในลิ้นชัก และบันทึกยอดเปิดกะในระบบ' },
  { id: 'o2',  label: 'เปิดกะในระบบ (กดเปิดกะที่หน้า กะทำงาน)' },
  { id: 'o3',  label: 'ตรวจสอบงานซ่อมค้างจากวันก่อน' },
  { id: 'o4',  label: 'เปิดเครื่องพิมพ์และทดสอบพิมพ์ใบทดสอบ' },
  { id: 'o5',  label: 'ตรวจสอบกระดาษใบเสร็จว่าเพียงพอ' },
  { id: 'o6',  label: 'เปิดโปรแกรม POS และทดสอบการขาย 1 รายการ (ยกเลิกภายหลัง)' },
  { id: 'o7',  label: 'ตรวจสอบสต็อกสินค้าขายดีว่าเพียงพอ' },
  { id: 'o8',  label: 'ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต' },
  { id: 'o9',  label: 'แจ้งลูกค้าที่รองาน: ส่งข้อความ/โทรแจ้งสถานะ (ถ้ามี)' },
  { id: 'o10', label: 'ตรวจสอบอุปกรณ์ชาร์จ / แสดงสินค้าว่าเรียบร้อย' },
]

const CLOSING_CHECKS = [
  { id: 'c1',  label: 'บันทึกงานซ่อมค้างทั้งหมดพร้อมสถานะล่าสุด' },
  { id: 'c2',  label: 'แจ้งลูกค้าที่งานเสร็จแล้วแต่ยังไม่มารับ' },
  { id: 'c3',  label: 'ปิดการขายทั้งหมด ไม่มีบิลค้างชำระ' },
  { id: 'c4',  label: 'นับเงินสดในลิ้นชัก และกรอกยอดปิดกะในระบบ' },
  { id: 'c5',  label: 'ปิดกะในระบบ (กดปิดกะที่หน้า กะทำงาน)' },
  { id: 'c6',  label: 'พิมพ์รายงานสรุปกะและตรวจสอบยอดขาย' },
  { id: 'c7',  label: 'จัดเก็บอุปกรณ์ / อะไหล่ที่ค้างงานให้เป็นระเบียบ' },
  { id: 'c8',  label: 'ปิดเครื่องพิมพ์และอุปกรณ์ที่ไม่จำเป็น' },
  { id: 'c9',  label: 'ตรวจสอบ Backup อัตโนมัติสำเร็จ (ถ้ามีการแจ้งเตือน)' },
  { id: 'c10', label: 'ล็อคร้าน / ปิดระบบ' },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ShiftChecklistPage() {
  const [tab, setTab] = useState<'opening' | 'closing'>('opening')
  const [openingDone, setOpeningDone] = useState<Set<string>>(new Set())
  const [closingDone,  setClosingDone]  = useState<Set<string>>(new Set())
  const printRef = useRef<HTMLDivElement>(null)

  const checks = tab === 'opening' ? OPENING_CHECKS : CLOSING_CHECKS
  const done   = tab === 'opening' ? openingDone    : closingDone
  const setDone = tab === 'opening'
    ? (s: Set<string>) => setOpeningDone(s)
    : (s: Set<string>) => setClosingDone(s)

  const toggle = (id: string) => {
    const next = new Set(done)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setDone(next)
  }

  const reset = () => setDone(new Set())

  const pct = Math.round((done.size / checks.length) * 100)
  const allDone = done.size === checks.length

  const handlePrint = () => {
    const title = tab === 'opening' ? 'Checklist เปิดร้าน' : 'Checklist ปิดร้าน'
    const dateStr = format(new Date(), 'dd MMMM yyyy', { locale: th })
    const rows = checks
      .map((c) => `<tr><td style="padding:6px 12px;font-size:13px;">${c.label}</td><td style="padding:6px 12px;text-align:center;">☐</td></tr>`)
      .join('')
    const html = `<!DOCTYPE html><html><head><title>${title}</title>
      <style>body{font-family:sans-serif;padding:24px}h2{margin-bottom:4px}p{color:#666;font-size:13px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}tr{border-bottom:1px solid #eee}td{vertical-align:middle}</style></head>
      <body><h2>${title}</h2><p>วันที่ ${dateStr} — ลงชื่อ ____________________</p>
      <table>${rows}</table></body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close(); w.print() }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Checklist เปิด-ปิดร้าน"
        subtitle="รายการตรวจสอบประจำวันสำหรับพนักงาน"
        primaryAction={
          <div className="flex gap-2">
            <Button onClick={reset} variant="ghost" size="sm">
              <RotateCcw className="h-4 w-4 mr-1" />
              รีเซ็ต
            </Button>
            <Button onClick={handlePrint} variant="outline" size="sm">
              <Printer className="h-4 w-4 mr-1" />
              พิมพ์
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {([['opening', 'เปิดร้าน', Sun], ['closing', 'ปิดร้าน', Moon]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">เสร็จแล้ว {done.size} / {checks.length}</span>
          {allDone && (
            <span className="text-green-600 font-medium">
              ครบทุกข้อ ✓
            </span>
          )}
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              allDone ? 'bg-green-500' : 'bg-primary',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Checklist */}
      <SectionCard title={tab === 'opening' ? 'รายการตรวจสอบ — เปิดร้าน' : 'รายการตรวจสอบ — ปิดร้าน'}>
        <div className="divide-y" ref={printRef}>
          {checks.map((item, idx) => (
            <label
              key={item.id}
              className="flex items-start gap-3 py-3.5 px-1 cursor-pointer hover:bg-muted/40 rounded-lg transition-colors select-none"
            >
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                <input
                  type="checkbox"
                  checked={done.has(item.id)}
                  onChange={() => toggle(item.id)}
                  className="h-4 w-4 rounded border-gray-300 text-primary accent-primary cursor-pointer"
                />
              </div>
              <div className="flex-1 min-w-0">
                <span className={cn(
                  'text-sm leading-relaxed',
                  done.has(item.id) && 'line-through text-muted-foreground',
                )}>
                  <span className="text-muted-foreground mr-1.5">{idx + 1}.</span>
                  {item.label}
                </span>
              </div>
            </label>
          ))}
        </div>
      </SectionCard>

      {/* Date/shift note */}
      <div className="text-xs text-muted-foreground text-center">
        {format(new Date(), "EEEE dd MMMM yyyy '·' HH:mm น.", { locale: th })}
      </div>
    </div>
  )
}

'use client'

/**
 * A bill that comes to 0 baht. Audit 2026-10: old sales were keyed as 0-baht bills ("ยอดเก่า",
 * a 100% discount), so the goods left stock with no income and the profit report showed a loss.
 * Now a 0-baht bill must say why (a gift or a claim, which the API checks), and a late entry
 * (an old sale) must carry its real price.
 */
export type ZeroReason = 'GIFT' | 'CLAIM'

const REASONS: { value: ZeroReason; label: string }[] = [
  { value: 'GIFT',  label: 'แถมให้ลูกค้า' },
  { value: 'CLAIM', label: 'เคลม / เปลี่ยนให้ลูกค้า' },
]

export function ZeroBillPanel({ lateOn, reason, onReason, onWriteOff }: {
  lateOn: boolean
  reason: ZeroReason | null
  onReason: (r: ZeroReason | null) => void
  onWriteOff: () => void
}) {
  return (
    <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
      <p className="font-bold">บิลนี้ยอด 0 บาท</p>
      {lateOn ? (
        <p className="text-xs font-semibold text-red-700 dark:text-red-300">
          บันทึกยอดขายย้อนหลังต้องใส่ราคาที่ขายจริง — ลบส่วนลดออกแล้วใส่ยอดที่ลูกค้าจ่าย
          (ยอดขายและกำไรจะถูกต้อง และเงินจะลงกะที่ขายจริง)
        </p>
      ) : (
        <>
          <p className="text-xs">
            ยอดขายเก่าที่ลืมคีย์ ให้ใช้ “บันทึกยอดขายย้อนหลัง” ด้วยราคาจริง — ไม่ใช่บิล 0 บาท ·
            ของแถม / เคลม ตัดสต๊อกพร้อมเหตุผลได้ หรือเลือกเหตุผลด้านล่าง
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onWriteOff}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white active:bg-amber-700">
              ตัดสต๊อก (แถม/เคลม)
            </button>
            {REASONS.map((r) => (
              <button key={r.value} type="button" onClick={() => onReason(reason === r.value ? null : r.value)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${reason === r.value
                  ? 'border-amber-600 bg-amber-600 text-white' : 'border-amber-300 bg-white text-amber-800 dark:bg-transparent dark:text-amber-200'}`}>
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

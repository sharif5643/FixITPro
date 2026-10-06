/**
 * Amount in Thai words as written on receipts: 4500 → "สี่พันห้าร้อยบาทถ้วน",
 * 1250.5 → "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์".
 */
const DIGIT = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const PLACE = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']

/** 0 < n < 1,000,000 */
function chunk(n: number): string {
  const s = String(n)
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i])
    const pos = s.length - i - 1
    if (d === 0) continue
    if (pos === 0 && d === 1 && s.length > 1) out += 'เอ็ด'
    else if (pos === 1 && d === 2) out += 'ยี่'
    else if (pos === 1 && d === 1) out += ''
    else out += DIGIT[d]
    out += PLACE[pos]
  }
  return out
}

function words(n: number): string {
  if (n === 0) return 'ศูนย์'
  const millions = Math.floor(n / 1_000_000)
  const rest = n % 1_000_000
  return (millions ? words(millions) + 'ล้าน' : '') + (rest ? chunk(rest) : '')
}

export function bahtText(amount: number): string {
  const satang = Math.round(Math.abs(amount) * 100)
  const baht = Math.floor(satang / 100)
  const st = satang % 100
  const neg = amount < 0 ? 'ลบ' : ''
  if (st === 0) return `${neg}${words(baht)}บาทถ้วน`
  return `${neg}${baht ? words(baht) + 'บาท' : ''}${words(st)}สตางค์`
}

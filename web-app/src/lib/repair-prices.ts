export type RepairPrice = {
  id: string
  brand: string
  model: string
  service: string
  price: number
  costPrice?: number | null
  warrantyDays: number | null
}

export type PriceDevice = { brand: string; models: string[] }

/** "" brand / model read as "ทุกยี่ห้อ" / "ทุกรุ่น" on screen. */
export const brandLabel = (b: string) => b || 'ทุกยี่ห้อ'
export const modelLabel = (m: string) => m || 'ทุกรุ่น'

/**
 * Tapping a price while taking a job in: the first tap adds the job to the issue text and its price
 * to the estimate, a second tap takes both back out.
 */
export function togglePricedJob(
  picked: RepairPrice[],
  p: RepairPrice,
  issue: string,
  estimate: number,
): { picked: RepairPrice[]; issue: string; estimate: number } {
  const on = picked.some((x) => x.id === p.id)
  if (on) {
    const parts = issue.split(/,\s*/).filter((s) => s.trim() !== p.service)
    return {
      picked: picked.filter((x) => x.id !== p.id),
      issue: parts.join(', '),
      estimate: Math.max(0, estimate - p.price),
    }
  }
  const text = issue.trim()
  return {
    picked: [...picked, p],
    issue: text ? `${text}, ${p.service}` : p.service,
    estimate: estimate + p.price,
  }
}

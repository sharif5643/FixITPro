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

const sameJob = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Tapping a price while taking a job in: the first tap adds the job to the issue text and its price
 * to the estimate, a second tap on the same job takes back what was added. Jobs match by name, so a
 * job picked before the model was typed (brand-wide price) is still the one taken back.
 */
export function togglePricedJob(
  picked: RepairPrice[],
  p: RepairPrice,
  issue: string,
  estimate: number,
): { picked: RepairPrice[]; issue: string; estimate: number } {
  const before = picked.find((x) => sameJob(x.service, p.service))
  if (before) {
    const parts = issue.split(/,\s*/).filter((s) => !sameJob(s, before.service))
    return {
      picked: picked.filter((x) => x !== before),
      issue: parts.join(', '),
      estimate: Math.max(0, estimate - before.price),
    }
  }
  const text = issue.trim()
  return {
    picked: [...picked, p],
    issue: text ? `${text}, ${p.service}` : p.service,
    estimate: estimate + p.price,
  }
}

/** A chip shows as picked when a job of that name is on the form. */
export const isPicked = (picked: RepairPrice[], service: string) => picked.some((x) => sameJob(x.service, service))

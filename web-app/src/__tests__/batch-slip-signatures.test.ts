import { describe, it, expect } from 'vitest'
import { slipSignatures, type BatchSignatureRow } from '@/components/repairs/repair-batch-print'
import { buildRepairBatchThermalHtml } from '@/lib/printer'

const A = 'data:image/png;base64,AAAA'
const B = 'data:image/png;base64,BBBB'
const C = 'data:image/png;base64,CCCC'
const row = (id: string, intake: [string, string, string] | null, staff: [string, string] | null): BatchSignatureRow => ({
  repairId: id,
  intake: intake ? { image: intake[0], signerName: intake[1], createdAt: intake[2] } : null,
  staff:  staff ? { name: staff[0], image: staff[1] } : null,
})

describe('signatures on the combined slip', () => {
  it('sender: the customer\'s latest signature on these jobs', () => {
    const s = slipSignatures([row('1', [A, 'คุณ ก', '2026-10-28T08:00:00Z'], null), row('2', [B, 'คุณ ข', '2026-10-28T09:00:00Z'], null)], null)
    expect(s.customer).toEqual({ image: B, name: 'คุณ ข' })
  })

  it('receiver: the one person who took them all in', () => {
    const s = slipSignatures([row('1', null, ['ช่าง A', A]), row('2', null, ['ช่าง A', A])], { name: 'คนพิมพ์', image: C })
    expect(s.staff).toEqual({ name: 'ช่าง A', image: A })
  })

  it('receiver: taken in by several people (or someone with no signature) → the person printing', () => {
    expect(slipSignatures([row('1', null, ['ช่าง A', A]), row('2', null, ['ช่าง B', B])], { name: 'คนพิมพ์', image: C }).staff)
      .toEqual({ name: 'คนพิมพ์', image: C })
    expect(slipSignatures([row('1', null, ['ช่าง A', A]), row('2', null, null)], { name: 'คนพิมพ์', image: C }).staff)
      .toEqual({ name: 'คนพิมพ์', image: C })
  })

  it('nothing signed → blank lines to sign on paper', () => {
    expect(slipSignatures([row('1', null, null)], { name: 'คนพิมพ์', image: null })).toEqual({ customer: null, staff: null })
  })

  it('the slip shows both signatures with names, or blank lines', () => {
    const summary = { rows: [], count: 0, returned: 0, atShop: 0, cancelled: 0, total: 0, paid: 0, owed: 0, unpriced: 0 } as never
    const signed = buildRepairBatchThermalHtml(summary, { kind: 'open' }, { name: 'ร้านตัวแทน' }, null, {
      signatures: { customer: { image: A, name: 'คุณวิชัย' }, staff: { image: B, name: 'ช่าง A' } },
    })
    expect(signed).toContain(`src="${A}"`)
    expect(signed).toContain(`src="${B}"`)
    expect(signed).toContain('(คุณวิชัย)')
    expect(signed).toContain('(ช่าง A)')
    const blank = buildRepairBatchThermalHtml(summary, { kind: 'open' }, { name: 'ร้านตัวแทน' }, null, {})
    expect(blank.match(/class="sig-line"/g)).toHaveLength(2)
    expect(blank).toContain('(ร้านตัวแทน)')
  })
})

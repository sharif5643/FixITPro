import { describe, it, expect } from 'vitest'
import { issueTagsFor, conditionsFor, accessoriesFor, withPicked, ALL_ISSUE_TAGS, DEVICE_TYPE_OPTIONS } from '@/lib/repair-tags'
import { brandsFor, modelsFor } from '@/lib/device-models'

describe('intake lists follow the kind of device', () => {
  it('a phone keeps the phone lists', () => {
    expect(issueTagsFor('มือถือ')).toContain('กล้อง')
    expect(issueTagsFor(undefined)).toContain('กล้อง')
    expect(accessoriesFor('มือถือ')).toContain('ซิม')
  })
  it('a notebook and a printer get their own', () => {
    expect(issueTagsFor('แล็ปท็อป')).toContain('คีย์บอร์ด')
    expect(conditionsFor('แล็ปท็อป')).toContain('บานพับหัก')
    expect(accessoriesFor('คอมพิวเตอร์ตั้งโต๊ะ')).toContain('อะแดปเตอร์/สายชาร์จ')
    expect(issueTagsFor('ปริ้นเตอร์')).toContain('กระดาษติด')
    expect(accessoriesFor('ปริ้นเตอร์')).toContain('ตลับหมึก/ขวดหมึก')
    expect(conditionsFor('ปริ้นเตอร์')).not.toContain('ฝาหลังแตก')
    expect(DEVICE_TYPE_OPTIONS).toContain('ปริ้นเตอร์')
  })
  it('what was already picked stays when the type changes', () => {
    expect(withPicked(issueTagsFor('ปริ้นเตอร์'), ['หน้าจอ'])).toContain('หน้าจอ')
    expect(withPicked(['a'], ['a'])).toEqual(['a'])
  })
  it('commission can be set for every job type', () => {
    for (const t of ['กล้อง', 'คีย์บอร์ด', 'กระดาษติด']) expect(ALL_ISSUE_TAGS).toContain(t)
  })
  it('brands and models follow the device', () => {
    expect(brandsFor('ปริ้นเตอร์')).toContain('Epson')
    expect(brandsFor('แล็ปท็อป')).toContain('Lenovo')
    expect(brandsFor('มือถือ')).toContain('Samsung')
    expect(modelsFor('Apple', 'แล็ปท็อป')[0]).toMatch(/MacBook/)
    expect(modelsFor('Apple', 'มือถือ')[0]).toMatch(/iPhone/)
    expect(modelsFor('HP', 'ปริ้นเตอร์')[0]).toMatch(/Smart Tank/)
  })
})

import { describe, it, expect } from 'vitest'
import { splitByOwner } from './use-sync-queue'
import { OfflineQueue, createInMemoryStorage } from '@/lib/offline-queue'

describe('offline queue: items go out under the person who did them', () => {
  it('records who queued it', async () => {
    const q = new OfflineQueue(createInMemoryStorage())
    const item = await q.enqueue('EXPENSE_CREATE', { amount: 50 }, { id: 'A', name: 'แคชเชียร์ A' })
    expect(item).toMatchObject({ userId: 'A', userName: 'แคชเชียร์ A' })
  })

  it("cashier B signing in does not send cashier A's offline expense (it would land in B's shift)", async () => {
    const q = new OfflineQueue(createInMemoryStorage())
    await q.enqueue('EXPENSE_CREATE', { amount: 50 }, { id: 'A', name: 'A' })
    await q.enqueue('EXPENSE_CREATE', { amount: 70 }, { id: 'B', name: 'B' })
    await q.enqueue('NOTIFICATION_READ', { id: 'n1' })       // older item, nobody recorded
    const pending = await q.getPending()
    const asB = splitByOwner(pending, 'B')
    expect(asB.mine.map((i) => (i.payload as any).amount ?? 'n')).toEqual([70, 'n'])
    expect(asB.others.map((i) => i.userId)).toEqual(['A'])
    expect(splitByOwner(pending, 'A').mine.map((i) => i.userId)).toEqual(['A', undefined])
  })
})

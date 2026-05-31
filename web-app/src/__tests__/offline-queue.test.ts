import { describe, it, expect, beforeEach } from 'vitest'
import { OfflineQueue, createInMemoryStorage } from '@/lib/offline-queue'

function makeQueue() {
  return new OfflineQueue(createInMemoryStorage())
}

// ── Queue enqueue ─────────────────────────────────────────────────────────────

describe('OfflineQueue — enqueue', () => {
  it('creates item with PENDING status', async () => {
    const q    = makeQueue()
    const item = await q.enqueue('REPAIR_CREATE', { customerName: 'Alice' })
    expect(item.status).toBe('PENDING')
    expect(item.retries).toBe(0)
    expect(item.type).toBe('REPAIR_CREATE')
  })

  it('generates unique IDs for concurrent enqueues', async () => {
    const q = makeQueue()
    const [a, b, c] = await Promise.all([
      q.enqueue('REPAIR_CREATE', {}),
      q.enqueue('EXPENSE_CREATE', {}),
      q.enqueue('NOTIFICATION_READ', { id: 'n1' }),
    ])
    expect(new Set([a.id, b.id, c.id]).size).toBe(3)
  })

  it('preserves payload exactly', async () => {
    const q       = makeQueue()
    const payload = { customerName: 'Bob', deviceBrand: 'Samsung', deposit: 300 }
    const item    = await q.enqueue('REPAIR_CREATE', payload)
    expect(item.payload).toEqual(payload)
  })

  it('records createdAt as a recent timestamp', async () => {
    const before = Date.now()
    const item   = await makeQueue().enqueue('EXPENSE_CREATE', {})
    const after  = Date.now()
    expect(item.createdAt).toBeGreaterThanOrEqual(before)
    expect(item.createdAt).toBeLessThanOrEqual(after)
  })
})

// ── Queue persistence ─────────────────────────────────────────────────────────

describe('OfflineQueue — persistence', () => {
  it('items survive across queue instances sharing the same storage', async () => {
    const storage = createInMemoryStorage()
    const q1      = new OfflineQueue(storage)
    await q1.enqueue('REPAIR_CREATE', { customerName: 'Test' })
    await q1.enqueue('EXPENSE_CREATE', { amount: 100 })

    const q2      = new OfflineQueue(storage)
    const pending = await q2.getPending()
    expect(pending).toHaveLength(2)
  })

  it('getAll returns items sorted by createdAt ascending', async () => {
    const q = makeQueue()
    for (let i = 0; i < 3; i++) {
      await q.enqueue('EXPENSE_CREATE', { seq: i })
      await new Promise((r) => setTimeout(r, 2))
    }
    const all = await q.getAll()
    expect((all[0].payload as any).seq).toBe(0)
    expect((all[2].payload as any).seq).toBe(2)
  })
})

// ── markSynced ────────────────────────────────────────────────────────────────

describe('OfflineQueue — markSynced', () => {
  it('changes status to SYNCED', async () => {
    const q    = makeQueue()
    const item = await q.enqueue('REPAIR_CREATE', {})
    await q.markSynced(item.id)
    const all  = await q.getAll()
    expect(all[0].status).toBe('SYNCED')
  })

  it('does not affect sibling items', async () => {
    const q = makeQueue()
    const a = await q.enqueue('REPAIR_CREATE', {})
    await q.enqueue('EXPENSE_CREATE', {})
    await q.markSynced(a.id)
    expect(await q.pendingCount()).toBe(1)
  })

  it('silently ignores an unknown ID', async () => {
    const q = makeQueue()
    await expect(q.markSynced('nonexistent')).resolves.toBeUndefined()
  })
})

// ── markFailed ────────────────────────────────────────────────────────────────

describe('OfflineQueue — markFailed', () => {
  it('sets status FAILED, stores error, increments retries', async () => {
    const q    = makeQueue()
    const item = await q.enqueue('REPAIR_CREATE', {})
    await q.markFailed(item.id, 'Network error')
    const all  = await q.getAll()
    expect(all[0].status).toBe('FAILED')
    expect(all[0].lastError).toBe('Network error')
    expect(all[0].retries).toBe(1)
  })

  it('increments retries on every failure', async () => {
    const q    = makeQueue()
    const item = await q.enqueue('REPAIR_CREATE', {})
    await q.markFailed(item.id, 'err1')
    await q.resetFailed()
    await q.markFailed(item.id, 'err2')
    const [result] = await q.getAll()
    expect(result.retries).toBe(2)
  })
})

// ── Reconnect sync ────────────────────────────────────────────────────────────

describe('OfflineQueue — reconnect sync flow', () => {
  it('all pending items can be synced and cleared', async () => {
    const q = makeQueue()
    await q.enqueue('REPAIR_CREATE',  { a: 1 })
    await q.enqueue('EXPENSE_CREATE', { b: 2 })

    const pending = await q.getPending()
    expect(pending).toHaveLength(2)

    for (const item of pending) await q.markSynced(item.id)
    await q.clearSynced()

    expect(await q.pendingCount()).toBe(0)
    expect(await q.getAll()).toHaveLength(0)
  })

  it('clearSynced leaves PENDING items untouched', async () => {
    const q = makeQueue()
    const a = await q.enqueue('REPAIR_CREATE', {})
    await q.enqueue('EXPENSE_CREATE', {})
    await q.markSynced(a.id)
    await q.clearSynced()

    const remaining = await q.getAll()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].status).toBe('PENDING')
  })
})

// ── Failed sync retry ─────────────────────────────────────────────────────────

describe('OfflineQueue — failed sync retry', () => {
  it('resetFailed moves FAILED items back to PENDING', async () => {
    const q    = makeQueue()
    const item = await q.enqueue('REPAIR_CREATE', {})
    await q.markFailed(item.id, 'Timeout')

    expect(await q.pendingCount()).toBe(0)

    await q.resetFailed()

    expect(await q.pendingCount()).toBe(1)
  })

  it('items keep being retryable across multiple failures', async () => {
    const q    = makeQueue()
    const item = await q.enqueue('EXPENSE_CREATE', { amount: 50 })

    for (let attempt = 0; attempt < 3; attempt++) {
      await q.markFailed(item.id, `err ${attempt}`)
      await q.resetFailed()
    }

    const pending = await q.getPending()
    expect(pending).toHaveLength(1)
    expect(pending[0].retries).toBe(3)
  })
})

// ── Repair offline create ─────────────────────────────────────────────────────

describe('Repair offline create', () => {
  it('queues the correct repair payload structure', async () => {
    const q       = makeQueue()
    const payload = {
      customerName:  'Charlie',
      customerPhone: '0812345678',
      deviceBrand:   'Apple',
      deviceModel:   'iPhone 15',
      issue:         'หน้าจอแตก',
      deposit:       500,
    }
    const item = await q.enqueue('REPAIR_CREATE', payload)
    expect(item.type).toBe('REPAIR_CREATE')
    const p = item.payload as typeof payload
    expect(p.customerName).toBe('Charlie')
    expect(p.deviceBrand).toBe('Apple')
    expect(p.deposit).toBe(500)
  })

  it('repair items appear in getPending and are retriable', async () => {
    const q = makeQueue()
    await q.enqueue('REPAIR_CREATE', { customerName: 'D' })
    await q.enqueue('REPAIR_CREATE', { customerName: 'E' })

    expect(await q.pendingCount()).toBe(2)

    const [first] = await q.getPending()
    await q.markFailed(first.id, 'offline')
    await q.resetFailed()

    expect(await q.pendingCount()).toBe(2)
  })
})

// ── Expense offline create ────────────────────────────────────────────────────

describe('Expense offline create', () => {
  it('queues the correct expense payload structure', async () => {
    const q       = makeQueue()
    const payload = {
      amount:        250,
      description:   'ค่าน้ำมัน',
      categoryId:    'cat_shipping',
      paymentMethod: 'CASH' as const,
      expenseDate:   '2026-05-28',
    }
    const item = await q.enqueue('EXPENSE_CREATE', payload)
    expect(item.type).toBe('EXPENSE_CREATE')
    const p = item.payload as typeof payload
    expect(p.amount).toBe(250)
    expect(p.paymentMethod).toBe('CASH')
    expect(p.expenseDate).toBe('2026-05-28')
  })

  it('multiple expenses queue independently', async () => {
    const q = makeQueue()
    await q.enqueue('EXPENSE_CREATE', { amount: 100 })
    await q.enqueue('EXPENSE_CREATE', { amount: 200 })
    await q.enqueue('EXPENSE_CREATE', { amount: 300 })

    const pending = await q.getPending()
    expect(pending).toHaveLength(3)
    const amounts = pending.map((i) => (i.payload as any).amount)
    expect(amounts).toContain(100)
    expect(amounts).toContain(300)
  })
})

// ── pendingCount ──────────────────────────────────────────────────────────────

describe('OfflineQueue — pendingCount', () => {
  it('returns 0 for empty queue', async () => {
    expect(await makeQueue().pendingCount()).toBe(0)
  })

  it('counts only PENDING items', async () => {
    const q = makeQueue()
    const a = await q.enqueue('REPAIR_CREATE', {})
    await q.enqueue('EXPENSE_CREATE', {})
    await q.markSynced(a.id)
    expect(await q.pendingCount()).toBe(1)
  })

  it('returns 0 after all items are synced and cleared', async () => {
    const q    = makeQueue()
    const item = await q.enqueue('REPAIR_CREATE', {})
    await q.markSynced(item.id)
    await q.clearSynced()
    expect(await q.pendingCount()).toBe(0)
  })
})

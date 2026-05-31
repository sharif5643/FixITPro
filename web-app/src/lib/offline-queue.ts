// IndexedDB-backed offline action queue.
// Uses an injectable QueueStorage interface so tests can run with in-memory storage.

export type QueueItemType = 'REPAIR_CREATE' | 'EXPENSE_CREATE' | 'NOTIFICATION_READ'
export type QueueItemStatus = 'PENDING' | 'SYNCED' | 'FAILED'

export interface QueueItem {
  id: string
  type: QueueItemType
  payload: unknown
  createdAt: number   // Unix ms
  status: QueueItemStatus
  retries: number
  lastError?: string
}

// ── Storage interface (allows test injection) ─────────────────────────────────

export interface QueueStorage {
  getAll(): Promise<QueueItem[]>
  put(item: QueueItem): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

// ── In-memory storage (for tests) ────────────────────────────────────────────

export function createInMemoryStorage(): QueueStorage {
  const store = new Map<string, QueueItem>()
  return {
    async getAll()       { return Array.from(store.values()) },
    async put(item)      { store.set(item.id, { ...item }) },
    async remove(id)     { store.delete(id) },
    async clear()        { store.clear() },
  }
}

// ── IndexedDB storage ─────────────────────────────────────────────────────────

const DB_NAME    = 'fixitpro_offline'
const STORE_NAME = 'queue'
const DB_VERSION = 1

let _dbPromise: Promise<IDBDatabase> | null = null

function getDB(): Promise<IDBDatabase> {
  if (!_dbPromise) {
    _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          }
        }
        req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result)
        req.onerror   = (e) => reject((e.target as IDBOpenDBRequest).error)
      } catch (err) {
        reject(err)
      }
    })
    // Reset on failure so next call retries
    _dbPromise.catch(() => { _dbPromise = null })
  }
  return _dbPromise
}

class IDBQueueStorage implements QueueStorage {
  async getAll(): Promise<QueueItem[]> {
    try {
      const db = await getDB()
      return new Promise((resolve, reject) => {
        const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll()
        req.onsuccess = () => resolve(req.result as QueueItem[])
        req.onerror   = () => reject(req.error)
      })
    } catch {
      return []
    }
  }

  async put(item: QueueItem): Promise<void> {
    try {
      const db = await getDB()
      return new Promise((resolve, reject) => {
        const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(item)
        req.onsuccess = () => resolve()
        req.onerror   = () => reject(req.error)
      })
    } catch {
      // silently skip — in-memory fallback path
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const db = await getDB()
      return new Promise((resolve, reject) => {
        const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id)
        req.onsuccess = () => resolve()
        req.onerror   = () => reject(req.error)
      })
    } catch {
      // silently skip
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await getDB()
      return new Promise((resolve, reject) => {
        const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear()
        req.onsuccess = () => resolve()
        req.onerror   = () => reject(req.error)
      })
    } catch {
      // silently skip
    }
  }
}

// ── OfflineQueue ──────────────────────────────────────────────────────────────

export class OfflineQueue {
  constructor(private storage: QueueStorage) {}

  async enqueue(type: QueueItemType, payload: unknown): Promise<QueueItem> {
    const item: QueueItem = {
      id:        `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      createdAt: Date.now(),
      status:    'PENDING',
      retries:   0,
    }
    await this.storage.put(item)
    return item
  }

  async getAll(): Promise<QueueItem[]> {
    const items = await this.storage.getAll()
    return items.sort((a, b) => a.createdAt - b.createdAt)
  }

  async getPending(): Promise<QueueItem[]> {
    return (await this.getAll()).filter((i) => i.status === 'PENDING')
  }

  async pendingCount(): Promise<number> {
    return (await this.getPending()).length
  }

  async markSynced(id: string): Promise<void> {
    const item = (await this.storage.getAll()).find((i) => i.id === id)
    if (!item) return
    await this.storage.put({ ...item, status: 'SYNCED' })
  }

  async markFailed(id: string, error: string): Promise<void> {
    const item = (await this.storage.getAll()).find((i) => i.id === id)
    if (!item) return
    await this.storage.put({ ...item, status: 'FAILED', lastError: error, retries: item.retries + 1 })
  }

  // Reset FAILED → PENDING so they are retried on next sync
  async resetFailed(): Promise<void> {
    const failed = (await this.storage.getAll()).filter((i) => i.status === 'FAILED')
    for (const item of failed) {
      await this.storage.put({ ...item, status: 'PENDING' })
    }
  }

  // Remove SYNCED items (housekeeping after successful sync)
  async clearSynced(): Promise<void> {
    const synced = (await this.storage.getAll()).filter((i) => i.status === 'SYNCED')
    for (const item of synced) {
      await this.storage.remove(item.id)
    }
  }
}

// ── Singleton (IDB in browser, in-memory during SSR/build) ───────────────────
// Also falls back to in-memory if indexedDB is not available (some WebViews).

function createStorage(): QueueStorage {
  if (typeof window === 'undefined') return createInMemoryStorage()
  if (typeof indexedDB === 'undefined') {
    console.warn('[OfflineQueue] IndexedDB unavailable — using in-memory fallback')
    return createInMemoryStorage()
  }
  return new IDBQueueStorage()
}

export const offlineQueue = new OfflineQueue(createStorage())

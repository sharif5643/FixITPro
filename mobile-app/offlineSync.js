// ============================================================
// src/services/offlineSync.js
// Offline Queue + Background Sync สำหรับ Sunmi
//
// Strategy:
//   - WatermelonDB (SQLite) เก็บ queue + local data
//   - Background sync ทุก 30 วินาที เมื่อมี connection
//   - Conflict resolution: server-wins สำหรับ stock
//                          client-wins สำหรับ draft repairs
// ============================================================

import { Database }  from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import NetInfo       from '@react-native-community/netinfo';
import AsyncStorage  from '@react-native-async-storage/async-storage';
import { api }       from './api';
import { schema }    from '../db/schema';
import { SyncQueue } from '../db/models/SyncQueue';

// ── Database Setup ────────────────────────────────────────
const adapter = new SQLiteAdapter({
  schema,
  dbName: 'fixitpro_offline',
  jsi: true,  // ใช้ JSI สำหรับ performance ดีขึ้น
});

export const database = new Database({ adapter, modelClasses: [SyncQueue] });

// ── Sync Queue Manager ────────────────────────────────────

class OfflineSyncService {
  constructor() {
    this._running    = false;
    this._interval   = null;
    this._retryCount = {};
    this.MAX_RETRIES = 5;
    this.RETRY_DELAY = 30000; // 30 วินาที
  }

  // ── Start background sync ──────────────────────────────
  start() {
    this._interval = setInterval(() => this.flush(), this.RETRY_DELAY);

    // ฟัง network change — sync ทันทีเมื่อกลับมา online
    NetInfo.addEventListener(state => {
      if (state.isConnected && !this._running) {
        this.flush();
      }
    });

    console.log('[Sync] Background service started');
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
  }

  // ── Add action to queue ────────────────────────────────
  /**
   * @param {object} action
   * @param {string} action.type   - 'CREATE_REPAIR' | 'UPDATE_STATUS' | 'POS_SALE' | 'ADD_PART'
   * @param {string} action.url    - API endpoint
   * @param {string} action.method - 'POST' | 'PATCH'
   * @param {object} action.body   - Request body
   * @param {string} [action.localId] - WatermelonDB local record ID (for optimistic updates)
   */
  async enqueue(action) {
    await database.write(async () => {
      await database.get('sync_queue').create(record => {
        record.type      = action.type;
        record.url       = action.url;
        record.method    = action.method;
        record.body      = JSON.stringify(action.body);
        record.localId   = action.localId ?? null;
        record.status    = 'pending';
        record.retries   = 0;
        record.createdAt = Date.now();
      });
    });

    console.log(`[Sync] Queued: ${action.type}`);

    // ลอง flush ทันที
    this.flush();
  }

  // ── Process queue ──────────────────────────────────────
  async flush() {
    if (this._running) return;

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      console.log('[Sync] Offline — skipping flush');
      return;
    }

    this._running = true;

    try {
      const queue = await database
        .get('sync_queue')
        .query()
        .fetch();

      const pending = queue
        .filter(q => q.status === 'pending' || q.status === 'retry')
        .sort((a, b) => a.createdAt - b.createdAt);

      console.log(`[Sync] Processing ${pending.length} items`);

      for (const item of pending) {
        await this._processItem(item);
      }
    } catch (err) {
      console.error('[Sync] Flush error:', err);
    } finally {
      this._running = false;
    }
  }

  async _processItem(item) {
    try {
      const body = JSON.parse(item.body);

      const response = await api.request({
        method: item.method,
        url:    item.url,
        data:   body,
      });

      // Success — ลบออกจาก queue
      await database.write(async () => {
        await item.destroyPermanently();
      });

      // Notify UI ผ่าน event
      this._emit('sync:success', {
        type:     item.type,
        localId:  item.localId,
        serverId: response.data?.data?.id,
        data:     response.data?.data,
      });

      console.log(`[Sync] Success: ${item.type}`);

    } catch (err) {
      const status  = err.response?.status;
      const errCode = err.response?.data?.error?.code;

      // ── Handle specific errors ──────────────────────────

      // 409 OUT_OF_STOCK — notify user, mark as failed (ไม่ retry)
      if (errCode === 'OUT_OF_STOCK') {
        await database.write(async () => {
          await item.update(r => {
            r.status    = 'failed';
            r.errorCode = errCode;
            r.errorMsg  = err.response.data.error.message;
          });
        });
        this._emit('sync:out_of_stock', {
          type:  item.type,
          items: err.response.data.error.items,
        });
        return;
      }

      // 4xx errors — don't retry (client error)
      if (status >= 400 && status < 500 && status !== 429) {
        await database.write(async () => {
          await item.update(r => {
            r.status   = 'failed';
            r.errorMsg = err.response?.data?.error?.message ?? err.message;
          });
        });
        return;
      }

      // 5xx or network error — retry with backoff
      const newRetries = (item.retries ?? 0) + 1;

      if (newRetries >= this.MAX_RETRIES) {
        await database.write(async () => {
          await item.update(r => {
            r.status  = 'failed';
            r.retries = newRetries;
          });
        });
        console.error(`[Sync] Max retries reached: ${item.type}`);
      } else {
        await database.write(async () => {
          await item.update(r => {
            r.status  = 'retry';
            r.retries = newRetries;
          });
        });
        console.log(`[Sync] Will retry ${item.type} (attempt ${newRetries})`);
      }
    }
  }

  // ── Event system (lightweight) ─────────────────────────
  _listeners = {};

  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
    return () => this.off(event, cb);
  }

  off(event, cb) {
    this._listeners[event] = (this._listeners[event] ?? []).filter(l => l !== cb);
  }

  _emit(event, data) {
    (this._listeners[event] ?? []).forEach(cb => cb(data));
  }

  // ── Optimistic POS Sale ───────────────────────────────
  /**
   * ทำ POS sale แบบ optimistic:
   * 1. แสดงผล success ทันที (local state)
   * 2. Queue ส่ง API จริงในพื้นหลัง
   * 3. ถ้า stock ไม่พอ → แจ้งเตือน + revert
   */
  async optimisticPOSSale(saleData) {
    // Generate temp local ID
    const localId = `local_${Date.now()}`;

    // Immediate local feedback
    this._emit('sale:optimistic', { localId, ...saleData });

    // Queue to server
    await this.enqueue({
      type:    'POS_SALE',
      url:     '/sales/pos',
      method:  'POST',
      body:    saleData,
      localId,
    });

    return localId;
  }

  // ── Get pending count ─────────────────────────────────
  async getPendingCount() {
    const queue = await database.get('sync_queue').query().fetch();
    return queue.filter(q => q.status === 'pending' || q.status === 'retry').length;
  }

  // ── Get failed items (for user to resolve) ────────────
  async getFailedItems() {
    const queue = await database.get('sync_queue').query().fetch();
    return queue.filter(q => q.status === 'failed').map(q => ({
      id:        q.id,
      type:      q.type,
      errorCode: q.errorCode,
      errorMsg:  q.errorMsg,
      createdAt: q.createdAt,
      body:      JSON.parse(q.body),
    }));
  }
}

export const syncService = new OfflineSyncService();

// ── WatermelonDB Schema ───────────────────────────────────
// src/db/schema.js
export const schema = {
  version: 1,
  tables: [
    {
      name: 'sync_queue',
      columns: [
        { name: 'type',       type: 'string' },
        { name: 'url',        type: 'string' },
        { name: 'method',     type: 'string' },
        { name: 'body',       type: 'string' },  // JSON string
        { name: 'local_id',   type: 'string', isOptional: true },
        { name: 'status',     type: 'string' },  // pending | retry | failed
        { name: 'retries',    type: 'number' },
        { name: 'error_code', type: 'string', isOptional: true },
        { name: 'error_msg',  type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    },
    {
      name: 'cached_products',
      columns: [
        { name: 'server_id',  type: 'string' },
        { name: 'sku',        type: 'string' },
        { name: 'name',       type: 'string' },
        { name: 'sell_price', type: 'number' },
        { name: 'cost_price', type: 'number' },
        { name: 'stock_qty',  type: 'number' },
        { name: 'barcode',    type: 'string', isOptional: true },
        { name: 'synced_at',  type: 'number' },
      ],
    },
  ],
};

// ── React Hook: useSyncStatus ─────────────────────────────
// src/hooks/useSyncStatus.js
import { useState, useEffect } from 'react';

export const useSyncStatus = () => {
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline]         = useState(true);
  const [lastSync, setLastSync]         = useState(null);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(s => setIsOnline(s.isConnected));

    const unsubSuccess = syncService.on('sync:success', async () => {
      setPendingCount(await syncService.getPendingCount());
      setLastSync(new Date());
    });

    const update = async () => {
      setPendingCount(await syncService.getPendingCount());
    };

    update();
    const timer = setInterval(update, 10000);

    return () => {
      unsub();
      unsubSuccess();
      clearInterval(timer);
    };
  }, []);

  return { pendingCount, isOnline, lastSync };
};

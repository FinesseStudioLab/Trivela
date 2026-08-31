/**
 * Offline action queue — IndexedDB-backed store for actions that were
 * attempted while the browser had no network connectivity (#790).
 *
 * Actions are written synchronously to IndexedDB as soon as they are
 * enqueued. A background flush loop retries them in order once the browser
 * reports `navigator.onLine === true`. On success the row is deleted; on
 * failure it is retried with exponential back-off up to MAX_ATTEMPTS.
 *
 * Usage:
 *   const queue = new OfflineQueue();
 *   await queue.open();
 *   await queue.enqueue({ type: 'register', payload: { campaignId: 'abc' } });
 *   queue.startFlush(async (action) => { await apiClient.register(action.payload); });
 */

export interface QueuedAction {
  id?: number;
  type: string;
  payload: unknown;
  enqueuedAt: number;
  attempts: number;
  lastError?: string;
}

const DB_NAME = 'trivela-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'actions';
const MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 5_000;

export class OfflineQueue {
  private db: IDBDatabase | null = null;
  private _flushTimer: ReturnType<typeof setTimeout> | null = null;
  private _handler: ((action: QueuedAction) => Promise<void>) | null = null;

  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('enqueuedAt', 'enqueuedAt', { unique: false });
        }
      };

      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };

      req.onerror = () => reject(req.error);
    });
  }

  async enqueue(action: Omit<QueuedAction, 'id' | 'enqueuedAt' | 'attempts'>): Promise<number> {
    const db = this._requireDb();
    const record: Omit<QueuedAction, 'id'> = {
      ...action,
      enqueuedAt: Date.now(),
      attempts: 0,
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).add(record);
      req.onsuccess = () => resolve(req.result as number);
      req.onerror = () => reject(req.error);
    });
  }

  async pending(): Promise<QueuedAction[]> {
    const db = this._requireDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).index('enqueuedAt').getAll();
      req.onsuccess = () => resolve(req.result as QueuedAction[]);
      req.onerror = () => reject(req.error);
    });
  }

  startFlush(handler: (action: QueuedAction) => Promise<void>): void {
    this._handler = handler;
    this._scheduleFlush();
    window.addEventListener('online', this._onOnline);
  }

  stopFlush(): void {
    if (this._flushTimer) clearTimeout(this._flushTimer);
    window.removeEventListener('online', this._onOnline);
  }

  private _onOnline = (): void => {
    if (this._flushTimer) clearTimeout(this._flushTimer);
    void this._flush();
  };

  private _scheduleFlush(): void {
    this._flushTimer = setTimeout(async () => {
      await this._flush();
      this._scheduleFlush();
    }, POLL_INTERVAL_MS);
  }

  private async _flush(): Promise<void> {
    if (!navigator.onLine) return;
    const handler = this._handler;
    if (!handler) return;

    const rows = await this.pending();
    for (const row of rows) {
      try {
        await handler(row);
        await this._delete(row.id!);
      } catch (err) {
        const newAttempts = row.attempts + 1;
        const lastError = err instanceof Error ? err.message : String(err);
        if (newAttempts >= MAX_ATTEMPTS) {
          await this._delete(row.id!);
        } else {
          await this._update({ ...row, attempts: newAttempts, lastError });
        }
      }
    }
  }

  private _delete(id: number): Promise<void> {
    const db = this._requireDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private _update(record: QueuedAction): Promise<void> {
    const db = this._requireDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private _requireDb(): IDBDatabase {
    if (!this.db) throw new Error('OfflineQueue not opened — call open() first');
    return this.db;
  }
}

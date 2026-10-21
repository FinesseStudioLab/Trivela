/**
 * Outbox relay service — transactional outbox pattern (#746).
 *
 * Rows are written to `outbox` atomically alongside the state change that
 * triggers them (see OutboxService.write). This relay worker picks up
 * pending rows and delivers them, retrying with exponential back-off until
 * the row is marked 'delivered' or retries are exhausted ('failed').
 *
 * Usage:
 *   const relay = new OutboxRelay(db, handlers, { logger });
 *   relay.start();     // begin polling
 *   relay.stop();      // graceful shutdown
 *
 * Tracing (issue #778): `writeOutbox` captures the enqueuing request's trace
 * context and stores it alongside the payload; `_deliver` re-establishes it
 * as the parent of a new `outbox.deliver` span, so a single trace shows the
 * full request → job path even though delivery happens on a later,
 * unrelated poll tick.
 */

import { captureTraceparent, linkedSpan } from '../tracing.js';

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_LOCK_DURATION_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BATCH_SIZE = 20;

/**
 * Write a side-effect intent to the outbox inside an existing DB transaction.
 *
 * @param {import('better-sqlite3').Database} db - Database connection (must be
 *   inside a transaction already started by the caller).
 * @param {string} eventType - Logical event type (e.g. "campaign.created").
 * @param {unknown} payload - JSON-serialisable delivery payload.
 * @param {object} [opts]
 * @param {string} [opts.partitionKey=''] - Worker shard key.
 * @param {number} [opts.delayMs=0] - Minimum delay before delivery attempt.
 * @returns {number} The inserted row id.
 */
export function writeOutbox(db, eventType, payload, opts = {}) {
  const { partitionKey = '', delayMs = 0 } = opts;
  const deliverAfter =
    delayMs > 0 ? new Date(Date.now() + delayMs).toISOString() : new Date().toISOString();

  // Stash the enqueuing request's trace context inside the stored envelope
  // (issue #778) rather than adding a DB column for it — `_traceparent` is a
  // reserved key on the envelope, never on the caller's own payload, so it
  // round-trips through the existing `payload TEXT` column with no schema
  // migration.
  const envelope = { payload, _traceparent: captureTraceparent() };

  const stmt = db.prepare(`
    INSERT INTO outbox (event_type, payload, partition_key, deliver_after)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(eventType, JSON.stringify(envelope), partitionKey, deliverAfter);
  return result.lastInsertRowid;
}

export class OutboxRelay {
  /**
   * @param {import('better-sqlite3').Database} db
   * @param {Record<string, (payload: unknown) => Promise<void>>} handlers
   *   Map of eventType → async handler function.
   * @param {object} [opts]
   * @param {number} [opts.pollIntervalMs]
   * @param {number} [opts.lockDurationMs]
   * @param {number} [opts.maxAttempts]
   * @param {number} [opts.batchSize]
   * @param {object} [opts.logger]
   */
  constructor(db, handlers, opts = {}) {
    this.db = db;
    this.handlers = handlers;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.lockDurationMs = opts.lockDurationMs ?? DEFAULT_LOCK_DURATION_MS;
    this.maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
    this.logger = opts.logger ?? console;
    this._timer = null;
    this._running = false;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._schedule();
  }

  stop() {
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _schedule() {
    if (!this._running) return;
    this._timer = setTimeout(async () => {
      try {
        await this._poll();
      } catch (err) {
        this.logger.error({ err }, 'outbox relay poll error');
      }
      this._schedule();
    }, this.pollIntervalMs);
  }

  async _poll() {
    const now = new Date().toISOString();
    const lockUntil = new Date(Date.now() + this.lockDurationMs).toISOString();

    // Claim a batch with an optimistic lock so multiple workers don't
    // double-deliver the same row.
    const rows = this.db
      .prepare(
        `UPDATE outbox
         SET locked_until = ?
         WHERE id IN (
           SELECT id FROM outbox
           WHERE status = 'pending'
             AND deliver_after <= ?
             AND (locked_until IS NULL OR locked_until < ?)
           ORDER BY id
           LIMIT ?
         )
         RETURNING id, event_type, payload, attempts`,
      )
      .all(lockUntil, now, now, this.batchSize);

    for (const row of rows) {
      await this._deliver(row);
    }
  }

  async _deliver(row) {
    const handler = this.handlers[row.event_type];
    let payload;
    let traceparent = null;
    try {
      const parsed = JSON.parse(row.payload);
      // Rows written before issue #778 store the raw payload directly;
      // rows written since wrap it as `{ payload, _traceparent }`. Detect by
      // the reserved `_traceparent` key rather than assuming every row is
      // the new shape, so already-queued (pre-deploy) rows still deliver.
      if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, '_traceparent')) {
        payload = parsed.payload;
        traceparent = parsed._traceparent;
      } else {
        payload = parsed;
      }
    } catch {
      this._markFailed(row.id, 'invalid JSON payload');
      return;
    }

    try {
      await linkedSpan(
        traceparent,
        'outbox.deliver',
        { 'outbox.event_type': row.event_type, 'outbox.id': row.id, 'outbox.attempts': row.attempts },
        async () => {
          if (handler) {
            await handler(payload);
          } else {
            this.logger.warn({ eventType: row.event_type }, 'no outbox handler registered');
          }
        },
      );
      this.db
        .prepare(`UPDATE outbox SET status = 'delivered', locked_until = NULL WHERE id = ?`)
        .run(row.id);
    } catch (err) {
      const newAttempts = row.attempts + 1;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (newAttempts >= this.maxAttempts) {
        this._markFailed(row.id, errMsg);
      } else {
        const backoffMs = Math.min(60_000 * Math.pow(2, newAttempts), 3_600_000);
        const nextDeliver = new Date(Date.now() + backoffMs).toISOString();
        this.db
          .prepare(
            `UPDATE outbox
             SET attempts = ?, last_error = ?, locked_until = NULL,
                 deliver_after = ?
             WHERE id = ?`,
          )
          .run(newAttempts, errMsg, nextDeliver, row.id);
        this.logger.warn(
          { id: row.id, attempts: newAttempts, errMsg },
          'outbox delivery retry scheduled',
        );
      }
    }
  }

  _markFailed(id, reason) {
    this.db
      .prepare(
        `UPDATE outbox
         SET status = 'failed', last_error = ?, locked_until = NULL
         WHERE id = ?`,
      )
      .run(reason, id);
    this.logger.error({ id, reason }, 'outbox row exhausted max retries — marked failed');
  }
}

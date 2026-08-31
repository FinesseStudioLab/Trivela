/**
 * Migration 037 — transactional outbox table (#746)
 *
 * The outbox pattern writes side-effect intents (webhook deliveries, etc.)
 * atomically in the same DB transaction as the state change that triggers
 * them, then a background relay worker delivers them independently. This
 * decouples delivery durability from the HTTP request lifecycle and
 * eliminates the "fire-and-forget lost event" failure mode.
 */

export const version = 37;
export const description = 'Add transactional outbox table for reliable side-effect delivery';

export const up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS outbox (
      id            INTEGER  PRIMARY KEY AUTOINCREMENT,
      -- Logical event type, e.g. "campaign.created" or "webhook.dispatch".
      event_type    TEXT     NOT NULL,
      -- JSON payload for the relay worker.
      payload       TEXT     NOT NULL,
      -- Discriminator so workers can claim disjoint partitions.
      partition_key TEXT     NOT NULL DEFAULT '',
      -- Wall-clock time the record was written (UTC ISO-8601).
      created_at    TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      -- Earliest time the relay worker may attempt delivery.
      deliver_after TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      -- NULL until a worker picks it up; used for optimistic lock.
      locked_until  TEXT,
      -- How many delivery attempts have been made.
      attempts      INTEGER  NOT NULL DEFAULT 0,
      -- NULL = pending, 'delivered' = done, 'failed' = exhausted retries.
      status        TEXT     NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'delivered', 'failed')),
      -- Human-readable error from the most recent attempt.
      last_error    TEXT
    );

    -- Primary query: relay worker scans for pending rows ready to deliver.
    CREATE INDEX IF NOT EXISTS idx_outbox_pending
      ON outbox (status, deliver_after)
      WHERE status = 'pending';

    -- Useful for per-partition worker coordination.
    CREATE INDEX IF NOT EXISTS idx_outbox_partition
      ON outbox (partition_key, status, deliver_after)
      WHERE status = 'pending';
  `);
};

export const down = (db) => {
  db.exec(`
    DROP INDEX IF EXISTS idx_outbox_partition;
    DROP INDEX IF EXISTS idx_outbox_pending;
    DROP TABLE IF EXISTS outbox;
  `);
};

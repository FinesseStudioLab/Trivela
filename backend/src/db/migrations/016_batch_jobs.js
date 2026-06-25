export const version = 16;
export const description = 'Add batch_payout_jobs and batch_payout_recipients tables';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS batch_payout_jobs (
      id                TEXT    PRIMARY KEY,
      campaign_id       TEXT,
      status            TEXT    NOT NULL DEFAULT 'pending',
      total_recipients  INTEGER NOT NULL DEFAULT 0,
      succeeded         INTEGER NOT NULL DEFAULT 0,
      failed            INTEGER NOT NULL DEFAULT 0,
      current_chunk     INTEGER NOT NULL DEFAULT 0,
      total_chunks      INTEGER,
      max_ops_per_tx    INTEGER NOT NULL DEFAULT 50,
      continue_on_error INTEGER NOT NULL DEFAULT 1,
      created_at        TEXT    NOT NULL,
      started_at        TEXT,
      completed_at      TEXT,
      error             TEXT
    );

    CREATE TABLE IF NOT EXISTS batch_payout_recipients (
      id                TEXT    PRIMARY KEY,
      batch_id          TEXT    NOT NULL REFERENCES batch_payout_jobs(id),
      recipient_address TEXT    NOT NULL,
      amount            INTEGER NOT NULL,
      chunk_index       INTEGER NOT NULL,
      status            TEXT    NOT NULL DEFAULT 'pending',
      tx_hash           TEXT,
      error             TEXT,
      processed_at      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_batch_payout_recipients_batch_id
      ON batch_payout_recipients(batch_id);

    CREATE INDEX IF NOT EXISTS idx_batch_payout_recipients_status
      ON batch_payout_recipients(batch_id, status);
  `);
}

#!/usr/bin/env node
// @ts-check
/**
 * Resumable historical event backfill CLI.
 *
 * Replays Soroban contract events from a start ledger to a target ledger (or
 * live head), using the same idempotent projection handlers as the live indexer.
 * Progress is checkpointed in the `indexer_checkpoints` table after every batch
 * so the process can be interrupted and resumed safely.
 *
 * Usage:
 *   node scripts/indexer-backfill.mjs --from <ledger> [--to <ledger>] \
 *     [--contract <contractId>] [--delay-ms <n>]
 */

import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { parseArgs } from 'node:util';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/db/migrate.js';
import { createRpcPool } from '../src/rpcPool.js';
import { createEventIndexer } from '../src/jobs/eventIndexer.js';

/**
 * Validate parsed CLI args. Exported for unit testing.
 * @param {Record<string, string | undefined>} values
 * @throws {Error} with usage message if args are invalid
 */
export function validateArgs(values) {
  if (!values.from) {
    throw new Error(
      'Usage: node scripts/indexer-backfill.mjs --from <ledger> [--to <ledger>] [--contract <id>] [--delay-ms <n>]',
    );
  }
  const from = Number.parseInt(values.from, 10);
  if (!Number.isFinite(from) || from <= 0) {
    throw new Error(`--from must be a positive integer, got: ${values.from}`);
  }
  if (values.to !== undefined) {
    const to = Number.parseInt(values.to, 10);
    if (!Number.isFinite(to) || to <= 0) {
      throw new Error(`--to must be a positive integer, got: ${values.to}`);
    }
    if (to < from) {
      throw new Error(`--to (${to}) must be >= --from (${from})`);
    }
  }
}

/**
 * Wrap synchronous better-sqlite3 as the async interface that eventIndexer expects.
 * eventIndexer calls `await db.run(sql, params)` and checks `result.changes`.
 *
 * @param {InstanceType<import('better-sqlite3')>} db
 */
export function makeAsyncDb(db) {
  return {
    run(sql, params = []) {
      const result = db.prepare(sql).run(params);
      return Promise.resolve({ changes: result.changes });
    },
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    from: { type: 'string' },
    to: { type: 'string' },
    contract: { type: 'string' },
    'delay-ms': { type: 'string' },
  },
  strict: true,
});

try {
  validateArgs(values);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const fromLedger = parseInt(values.from, 10);
const toLedger = values.to ? parseInt(values.to, 10) : null;
const contractId = values.contract ?? null;
const delayMs = Math.max(0, parseInt(values['delay-ms'] ?? '200', 10));

const dbPath = process.env.DB_PATH ?? './trivela.db';
const db = new Database(dbPath);
await runMigrations(db);

const rawUrls = process.env.SOROBAN_RPC_URLS ?? process.env.SOROBAN_RPC_URL ?? '';
const rpcUrls = rawUrls
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

if (rpcUrls.length === 0) {
  console.error('Error: SOROBAN_RPC_URL (or SOROBAN_RPC_URLS) is required');
  process.exit(1);
}

const rpcPool = createRpcPool(rpcUrls);
const indexer = createEventIndexer({ db: makeAsyncDb(db), rpcPool, logger: console });

const checkpointKey = `backfill:${contractId ?? 'all'}:${fromLedger}`;
const saved = db.prepare('SELECT * FROM indexer_checkpoints WHERE key = ?').get(checkpointKey);
let cursor = saved?.cursor ?? null;
let eventsProcessed = saved?.events_processed ?? 0;

const saveCheckpoint = db.prepare(`
  INSERT OR REPLACE INTO indexer_checkpoints (key, cursor, events_processed, updated_at)
  VALUES (?, ?, ?, ?)
`);

let stopped = false;
process.once('SIGINT', () => {
  stopped = true;
});

const startTime = Date.now();
console.log(
  `Backfill starting: from=${fromLedger} to=${toLedger ?? 'live'} contract=${contractId ?? 'all'} delay=${delayMs}ms`,
);
if (saved) {
  console.log(`Resuming from checkpoint: cursor=${cursor} events≈${eventsProcessed}`);
}

while (!stopped) {
  let nextCursor;
  try {
    nextCursor = await indexer.poll(contractId, cursor);
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (msg.toLowerCase().includes('before the first ledger')) {
      console.error(
        `Error: ledger ${fromLedger} is before this RPC node's earliest history. Try a more recent --from.`,
      );
      db.close();
      process.exit(1);
    }
    throw err;
  }

  // Checkpoint after each batch — safe to resume from here on interrupt
  saveCheckpoint.run(checkpointKey, nextCursor ?? cursor, eventsProcessed, new Date().toISOString());

  eventsProcessed += 200; // approximate (poll returns up to 200 events per page)
  const elapsedS = (Date.now() - startTime) / 1000;
  const rate = elapsedS > 0 ? (eventsProcessed / elapsedS).toFixed(1) : '?';
  console.log(`events≈${eventsProcessed} rate=${rate}/s cursor=${nextCursor ?? cursor}`);

  // Stop if we've reached the live head (cursor hasn't advanced)
  if (nextCursor === cursor || nextCursor == null) {
    console.log('Reached live head. Done.');
    break;
  }

  cursor = nextCursor;

  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

if (stopped) {
  console.log('Interrupted. Checkpoint saved — re-run with the same --from to resume.');
}

const totalMs = Date.now() - startTime;
console.log(
  `Backfill complete. events≈${eventsProcessed} duration=${(totalMs / 1000).toFixed(1)}s`,
);
db.close();

} // end if (isMain)

/**
 * Seed script — populates a local SQLite database with deterministic
 * fixture data for development and devnet integration testing.
 *
 * Usage:
 *   node backend/src/tests/seed.js [--db ./trivela-dev.db]
 *
 * The script is idempotent: it clears the campaigns table before inserting
 * so re-running it always produces the same state.
 */

import Database from 'better-sqlite3';
import { makeCampaigns, makeApiKey } from './factories.js';

const args = process.argv.slice(2);
const dbFlag = args.indexOf('--db');
const dbPath = dbFlag !== -1 ? args[dbFlag + 1] : './trivela-dev.db';

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    description    TEXT,
    active         INTEGER NOT NULL DEFAULT 1,
    featured       INTEGER NOT NULL DEFAULT 0,
    reward_per_action INTEGER NOT NULL DEFAULT 0,
    max_participants  INTEGER,
    start_date     TEXT,
    end_date       TEXT,
    image_url      TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );
`);

db.prepare('DELETE FROM campaigns').run();

const insert = db.prepare(`
  INSERT INTO campaigns
    (name, description, active, featured, reward_per_action, created_at, updated_at)
  VALUES
    (@name, @description, @active, @featured, @rewardPerAction, @createdAt, @updatedAt)
`);

const seed = db.transaction(() => {
  for (const c of makeCampaigns(10)) {
    insert.run({
      name: c.name,
      description: c.description,
      active: c.active ? 1 : 0,
      featured: c.featured ? 1 : 0,
      rewardPerAction: c.rewardPerAction,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    });
  }
});

seed();

const count = db.prepare('SELECT COUNT(*) AS n FROM campaigns').get();
console.log(`Seeded ${count.n} campaigns into ${dbPath}`);

const key = makeApiKey();
console.log(`\nDev API key (not stored — pass via TRIVELA_API_KEYS env var):`);
console.log(`  TRIVELA_API_KEYS=${key.key}`);

db.close();

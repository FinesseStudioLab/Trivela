// @ts-check
//
// PostgreSQL migration runner (issue #284).
//
// Reads `*.sql` files from `migrations/`, runs each one inside a single
// transaction, and records the applied version in `_schema_migrations`.
// Re-running is idempotent — already-applied versions are skipped.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

const SCHEMA_TABLE = `
  CREATE TABLE IF NOT EXISTS _schema_migrations (
    version     INTEGER     PRIMARY KEY,
    description TEXT        NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

/**
 * Parse the leading integer + slug from a migration filename, e.g.
 *   001_initial_schema.sql  ->  { version: 1, description: 'initial schema' }
 *
 * @param {string} file
 */
function parseMigrationFile(file) {
  const match = file.match(/^(\d+)_(.+)\.sql$/);
  if (!match) return null;
  return {
    file,
    version: Number(match[1]),
    description: match[2].replace(/[_-]/g, ' '),
  };
}

/**
 * Run all pending PG migrations against the given pool.
 *
 * @param {import('pg').Pool} pool
 */
export async function runPgMigrations(pool) {
  const client = await pool.connect();
  try {
    await client.query(SCHEMA_TABLE);

    /** @type {{ rows: { version: number }[] }} */
    const applied = await client.query(
      'SELECT version FROM _schema_migrations ORDER BY version ASC',
    );
    const appliedVersions = new Set(applied.rows.map((r) => r.version));

    const allFiles = await readdir(MIGRATIONS_DIR);
    const migrations = allFiles
      .map(parseMigrationFile)
      .filter(/** @returns {m is NonNullable<typeof m>} */ (m) => m !== null)
      .sort((a, b) => a.version - b.version);

    for (const m of migrations) {
      if (appliedVersions.has(m.version)) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, m.file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO _schema_migrations (version, description) VALUES ($1, $2)',
          [m.version, m.description],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        const filename = basename(m.file);
        throw new Error(`Migration ${filename} failed: ${err.message ?? err}`);
      }
    }
  } finally {
    client.release();
  }
}

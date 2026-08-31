/**
 * Trivela DB migration runner.
 *
 * Usage:
 *   node src/db/migrate.js [--db <path>]
 *
 * From package.json scripts:
 *   npm run db:migrate
 *
 * Migrations live in src/db/migrations/ and are named NNN_<description>.js.
 * Each file must export:
 *   - version  {number}  – unique monotonically-increasing integer
 *   - description {string}
 *   - up(db)   {function} – receives a better-sqlite3 Database instance
 */

// @ts-check
import { createRequire } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATIONS_DIR = join(__dirname, 'migrations');
const SCHEMA_VERSION_TABLE = `
  CREATE TABLE IF NOT EXISTS _schema_migrations (
    version     INTEGER PRIMARY KEY,
    description TEXT    NOT NULL,
    applied_at  TEXT    NOT NULL
  );
`;

/**
 * @param {InstanceType<typeof Database>} db
 * @returns {Set<number>}
 */
function appliedVersions(db) {
  db.exec(SCHEMA_VERSION_TABLE);
  const rows = db.prepare('SELECT version FROM _schema_migrations').all();
  return new Set(rows.map((r) => r.version));
}

/**
 * Adapts a plain `.sql` migration to the module shape the runner expects.
 * The version comes from the NNN_ filename prefix; the whole file is executed
 * as one statement batch inside the same transaction as any `.js` migration.
 *
 * @param {string} file
 */
async function loadSqlMigration(file) {
  const version = Number.parseInt(file.slice(0, 3), 10);
  if (!Number.isInteger(version)) {
    throw new Error(`SQL migration ${file} must start with a NNN_ version prefix`);
  }

  const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
  return {
    version,
    description: file,
    up: (db) => db.exec(sql),
  };
}

/**
 * Run all pending migrations against the given database.
 * @param {InstanceType<typeof Database>} db
 * @returns {Promise<{ applied: number[] }>}
 */
export async function runMigrations(db) {
  const entries = await readdir(MIGRATIONS_DIR);
  // lexicographic — the NNN_ prefix keeps them in order
  const files = entries.filter((f) => f.endsWith('.js') || f.endsWith('.sql')).sort();

  const applied = appliedVersions(db);
  const ran = [];

  for (const file of files) {
    const mod = file.endsWith('.sql')
      ? await loadSqlMigration(file)
      : await import(pathToFileURL(join(MIGRATIONS_DIR, file)).href);

    if (typeof mod.version !== 'number') {
      throw new Error(`Migration ${file} must export a numeric "version"`);
    }
    if (applied.has(mod.version)) continue;

    const applyMigration = db.transaction(() => {
      mod.up(db);
      // INSERT OR IGNORE so that multiple files sharing the same version number (a
      // pre-existing repo condition) can all run their up() without crashing on the
      // unique-version constraint.  The first file's description wins in the log.
      db.prepare(
        'INSERT OR IGNORE INTO _schema_migrations (version, description, applied_at) VALUES (?, ?, ?)',
      ).run(mod.version, mod.description ?? file, new Date().toISOString());
    });

    applyMigration();
    ran.push(mod.version);
    if (process.env.MIGRATE_VERBOSE === '1') {
      console.log(`  ✓ migration ${mod.version}: ${mod.description ?? file}`);
    }
  }

  return { applied: ran };
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const dbFlagIdx = args.indexOf('--db');
  const dbPath = dbFlagIdx !== -1 ? args[dbFlagIdx + 1] : (process.env.DB_PATH ?? './trivela.db');

  console.log(`Running migrations on: ${dbPath}`);
  const db = new Database(dbPath);
  runMigrations(db)
    .then(({ applied }) => {
      if (applied.length === 0) {
        console.log('Nothing to migrate — already up to date.');
      } else {
        console.log(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);
      }
      db.close();
    })
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}

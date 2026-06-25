// @ts-check
import { createHash } from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const EXPORT_TABLES = [
  'campaigns',
  'credit_events',
  'claim_events',
  'referral_credits',
  'referral_bonus_events',
];

const SCHEMA_VERSION = '1';

/**
 * Daily data export job — writes CSV files + manifest to object storage.
 *
 * - Idempotent: skips if today's export is already in the `export_checkpoints` table.
 * - Atomic publish: manifest is uploaded last; a failed mid-run is detectable by
 *   the absence of manifest.json.
 * - Retention: prunes exports older than `retentionDays` on local storage only.
 *
 * @param {{
 *   db: InstanceType<import('better-sqlite3')>,
 *   storage: import('../storage/storageAdapter.js').StorageAdapter,
 *   logger?: { info?: Function, warn?: Function, error?: Function },
 *   retentionDays?: number,
 *   uploadDir?: string,
 * }} options
 */
export function createExportJob({
  db,
  storage,
  logger = console,
  retentionDays = 30,
  uploadDir = './uploads',
}) {
  const checkpointSelectStmt = db.prepare('SELECT date FROM export_checkpoints WHERE date = ?');
  const checkpointInsertStmt = db.prepare(
    'INSERT INTO export_checkpoints (date, completed_at) VALUES (?, ?)',
  );
  const tableExistsStmt = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
  );

  /**
   * Run the export for a given date (default: today).
   * @param {string} [date] ISO date string YYYY-MM-DD
   */
  async function run(date) {
    const exportDate = date ?? new Date().toISOString().slice(0, 10);

    const existing = checkpointSelectStmt.get(exportDate);
    if (existing) {
      logger.info?.(`export:skip date=${exportDate} reason=already_done`);
      return;
    }

    logger.info?.(`export:start date=${exportDate}`);

    const exportedAt = new Date().toISOString();
    const manifest = {
      schemaVersion: SCHEMA_VERSION,
      exportedAt,
      asOfDate: exportDate,
      files: [],
    };

    for (const tableName of EXPORT_TABLES) {
      const exists = tableExistsStmt.get(tableName);
      const rows = exists ? db.prepare(`SELECT * FROM ${tableName}`).all() : [];
      const csv = buildCsv(rows);
      const buffer = Buffer.from(csv, 'utf8');
      const checksum = createHash('sha256').update(buffer).digest('hex');
      const filename = `exports/dt=${exportDate}/${tableName}.csv`;

      await storage.upload({ buffer, filename, mimeType: 'text/csv' });

      manifest.files.push({
        table: tableName,
        filename,
        rowCount: rows.length,
        checksum,
        format: 'csv',
      });
    }

    // Manifest uploaded last — its presence signals a complete, valid export
    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    await storage.upload({
      buffer: manifestBuffer,
      filename: `exports/dt=${exportDate}/manifest.json`,
      mimeType: 'application/json',
    });

    // Record checkpoint only after all uploads succeed
    checkpointInsertStmt.run(exportDate, new Date().toISOString());
    logger.info?.(`export:done date=${exportDate} tables=${EXPORT_TABLES.length}`);

    // Prune old exports on local storage (S3/IPFS manage retention separately)
    if (storage.backendName === 'local') {
      await pruneOldExports(uploadDir, retentionDays);
    }
  }

  return { run };
}

/**
 * Serialize an array of row objects to CSV text.
 * Cells containing commas, double-quotes, or newlines are quoted per RFC 4180.
 *
 * @param {Record<string, unknown>[]} rows
 * @returns {string}
 */
function buildCsv(rows) {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [cols.join(',')];
  for (const row of rows) {
    lines.push(cols.map((c) => escape(row[c])).join(','));
  }
  return lines.join('\n') + '\n';
}

/**
 * Remove export directories older than `retentionDays` from local storage.
 *
 * @param {string} uploadDir
 * @param {number} retentionDays
 */
async function pruneOldExports(uploadDir, retentionDays) {
  const exportsDir = join(uploadDir, 'exports');
  let entries;
  try {
    entries = await readdir(exportsDir);
  } catch {
    return; // exports dir may not exist yet
  }
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  for (const entry of entries) {
    const match = entry.match(/^dt=(\d{4}-\d{2}-\d{2})$/);
    if (match && new Date(match[1]) < cutoff) {
      await rm(join(exportsDir, entry), { recursive: true, force: true });
    }
  }
}

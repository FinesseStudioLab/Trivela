/**
 * SQLite persistence layer for campaigns.
 *
 * Usage
 * -----
 * - Production: set `DB_PATH` env var to a file path (e.g. `./data/campaigns.db`).
 * - Tests / development: omit `DB_PATH` to use an in-memory database (`:memory:`).
 *   Each `createDb()` call returns a fresh database, giving perfect test isolation.
 *
 * Schema migration
 * ----------------
 * The `campaigns` table is created on first connection via `CREATE TABLE IF NOT
 * EXISTS`.  For more complex future migrations, replace this with a dedicated
 * migration library.
 */

import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS campaigns (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  description      TEXT    NOT NULL DEFAULT '',
  active           INTEGER NOT NULL DEFAULT 1,
  reward_per_action INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL
);
`;

/** Convert a SQLite row to the API campaign shape. */
function rowToCampaign(row) {
  return {
    id: String(row.id),
    name: row.name,
    description: row.description,
    active: row.active === 1,
    rewardPerAction: row.reward_per_action,
    createdAt: row.created_at,
  };
}

/**
 * Open (or create) a SQLite database and return a set of CRUD helpers.
 *
 * @param {string} [dbPath=':memory:'] - File path or ':memory:'.
 * @param {object[]} [seed=[]]        - Optional rows to insert when the table
 *                                      is empty (used to pre-load defaults).
 */
export function createDb(dbPath = ':memory:', seed = []) {
  const db = new Database(dbPath);
  db.exec(SCHEMA);

  // Seed initial data when the table is empty.
  if (seed.length > 0) {
    const count = db.prepare('SELECT COUNT(*) AS n FROM campaigns').get().n;
    if (count === 0) {
      const insert = db.prepare(
        'INSERT INTO campaigns (name, description, active, reward_per_action, created_at) VALUES (?, ?, ?, ?, ?)',
      );
      const insertMany = db.transaction((rows) => {
        for (const row of rows) {
          insert.run(row.name, row.description ?? '', row.active ? 1 : 0, row.rewardPerAction ?? 0, row.createdAt ?? new Date().toISOString());
        }
      });
      insertMany(seed);
    }
  }

  return {
    /** Return all campaigns, optionally filtered by active status and text query. */
    getAll({ active, q } = {}) {
      const hasQuery = typeof q === 'string' && q.length > 0;
      const queryTerm = hasQuery ? `%${q.toLowerCase()}%` : null;

      if (active !== undefined && hasQuery) {
        const rows = db
          .prepare(
            'SELECT * FROM campaigns WHERE active = ? AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ?) ORDER BY id ASC',
          )
          .all(active ? 1 : 0, queryTerm, queryTerm);
        return rows.map(rowToCampaign);
      }

      if (hasQuery) {
        return db
          .prepare(
            'SELECT * FROM campaigns WHERE LOWER(name) LIKE ? OR LOWER(description) LIKE ? ORDER BY id ASC',
          )
          .all(queryTerm, queryTerm)
          .map(rowToCampaign);
      }

      if (active !== undefined) {
        const rows = db
          .prepare('SELECT * FROM campaigns WHERE active = ? ORDER BY id ASC')
          .all(active ? 1 : 0);
        return rows.map(rowToCampaign);
      }
      return db
        .prepare('SELECT * FROM campaigns ORDER BY id ASC')
        .all()
        .map(rowToCampaign);
    },

    /** Return a single campaign by string id, or undefined. */
    getById(id) {
      const row = db
        .prepare('SELECT * FROM campaigns WHERE id = ?')
        .get(Number(id));
      return row ? rowToCampaign(row) : undefined;
    },

    /** Insert a new campaign and return it. */
    create({ name, description = '', rewardPerAction = 0 }) {
      const createdAt = new Date().toISOString();
      const info = db
        .prepare(
          'INSERT INTO campaigns (name, description, active, reward_per_action, created_at) VALUES (?, ?, 1, ?, ?)',
        )
        .run(name, description, rewardPerAction, createdAt);
      return rowToCampaign(
        db.prepare('SELECT * FROM campaigns WHERE id = ?').get(info.lastInsertRowid),
      );
    },

    /**
     * Update allowed fields of a campaign and return the updated record.
     * Returns undefined if the campaign does not exist.
     */
    update(id, fields) {
      const allowed = ['name', 'description', 'active', 'rewardPerAction'];
      const columnMap = { name: 'name', description: 'description', active: 'active', rewardPerAction: 'reward_per_action' };

      const sets = [];
      const values = [];
      for (const key of allowed) {
        if (key in fields) {
          sets.push(`${columnMap[key]} = ?`);
          const val = key === 'active' ? (fields[key] ? 1 : 0) : fields[key];
          values.push(val);
        }
      }
      if (sets.length === 0) return this.getById(id);

      values.push(Number(id));
      db.prepare(`UPDATE campaigns SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      return this.getById(id);
    },

    /**
     * Delete a campaign by id.
     * Returns true if a row was deleted, false if not found.
     */
    delete(id) {
      const info = db
        .prepare('DELETE FROM campaigns WHERE id = ?')
        .run(Number(id));
      return info.changes > 0;
    },
  };
}

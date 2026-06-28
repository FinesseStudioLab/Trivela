import Database from 'better-sqlite3';
import { computeEntryHash, GENESIS_HASH } from '../services/auditChain.js';

function rowToAuditLog(row) {
  return {
    id: String(row.id),
    actor: row.actor,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id ?? null,
    diff: row.diff ? JSON.parse(row.diff) : null,
    orgId: row.org_id ?? null,
    timestamp: row.created_at,
    seq: row.seq ?? null,
    prevHash: row.prev_hash ?? null,
    entryHash: row.entry_hash ?? null,
  };
}

export function createSqliteAuditLogRepository({ db }) {
  const insertStmt = db.prepare(
    `INSERT INTO audit_logs
       (actor, action, entity, entity_id, diff, org_id, created_at, seq, prev_hash, entry_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const lastSeqStmt = db.prepare(
    `SELECT seq, entry_hash FROM audit_logs WHERE seq IS NOT NULL ORDER BY seq DESC LIMIT 1`,
  );

  const appendEntry = db.transaction(
    ({ actor, action, entity, entityId, diffJson, orgId, createdAt }) => {
      const last = lastSeqStmt.get();
      const seq = last ? last.seq + 1 : 1;
      const prevHash = last ? last.entry_hash : GENESIS_HASH;
      const entryHash = computeEntryHash(prevHash, {
        actor,
        action,
        entity,
        entityId,
        diff: diffJson ? JSON.parse(diffJson) : null,
        orgId,
        createdAt,
      });
      const info = insertStmt.run(
        actor, action, entity, entityId, diffJson, orgId, createdAt,
        seq, prevHash, entryHash,
      );
      return db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(info.lastInsertRowid);
    },
  );

  function create({
    actor,
    action,
    entity,
    entityId = null,
    diff = null,
    orgId = null,
    timestamp = null,
  }) {
    const createdAt = timestamp ?? new Date().toISOString();
    const diffJson = diff ? JSON.stringify(diff) : null;
    const row = appendEntry({ actor, action, entity, entityId, diffJson, orgId, createdAt });
    return rowToAuditLog(row);
  }

  function list({
    entity,
    entityId,
    action,
    orgId,
    actor,
    startDate,
    endDate,
    limit = 100,
    offset = 0,
  } = {}) {
    const filters = [];
    const values = [];

    if (orgId) {
      filters.push('org_id = ?');
      values.push(orgId);
    }
    if (entity) {
      filters.push('entity = ?');
      values.push(entity);
    }
    if (entityId) {
      filters.push('entity_id = ?');
      values.push(String(entityId));
    }
    if (action) {
      filters.push('action = ?');
      values.push(action);
    }
    if (actor) {
      filters.push('actor = ?');
      values.push(actor);
    }
    if (startDate) {
      filters.push('created_at >= ?');
      values.push(startDate);
    }
    if (endDate) {
      filters.push('created_at <= ?');
      values.push(endDate);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const limitClause = `LIMIT ${limit} OFFSET ${offset}`;

    return db
      .prepare(`SELECT * FROM audit_logs ${where} ORDER BY id DESC ${limitClause}`)
      .all(...values)
      .map(rowToAuditLog);
  }

  function count({ entity, entityId, action, orgId, actor, startDate, endDate } = {}) {
    const filters = [];
    const values = [];

    if (orgId) {
      filters.push('org_id = ?');
      values.push(orgId);
    }
    if (entity) {
      filters.push('entity = ?');
      values.push(entity);
    }
    if (entityId) {
      filters.push('entity_id = ?');
      values.push(String(entityId));
    }
    if (action) {
      filters.push('action = ?');
      values.push(action);
    }
    if (actor) {
      filters.push('actor = ?');
      values.push(actor);
    }
    if (startDate) {
      filters.push('created_at >= ?');
      values.push(startDate);
    }
    if (endDate) {
      filters.push('created_at <= ?');
      values.push(endDate);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const result = db.prepare(`SELECT COUNT(*) as total FROM audit_logs ${where}`).get(...values);
    return result.total;
  }

  /**
   * Walk every chained entry in sequence order and recompute each hash.
   * Returns { valid: true, checkedCount } if the chain is intact, or
   * { valid: false, firstBrokenSeq, checkedCount } at the first mismatch.
   */
  function verify() {
    const rows = db
      .prepare(
        `SELECT seq, actor, action, entity, entity_id, diff, org_id, created_at, prev_hash, entry_hash
           FROM audit_logs
          WHERE seq IS NOT NULL
          ORDER BY seq ASC`,
      )
      .all();

    if (rows.length === 0) {
      return { valid: true, checkedCount: 0 };
    }

    let expectedPrev = GENESIS_HASH;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const recomputed = computeEntryHash(expectedPrev, {
        actor: row.actor,
        action: row.action,
        entity: row.entity,
        entityId: row.entity_id ?? null,
        diff: row.diff ? JSON.parse(row.diff) : null,
        orgId: row.org_id ?? null,
        createdAt: row.created_at,
      });

      if (row.prev_hash !== expectedPrev || row.entry_hash !== recomputed) {
        return { valid: false, firstBrokenSeq: row.seq, checkedCount: i };
      }

      expectedPrev = row.entry_hash;
    }

    return { valid: true, checkedCount: rows.length };
  }

  return {
    create,
    list,
    count,
    verify,
  };
}

import Database from 'better-sqlite3';

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
  };
}

export function createSqliteAuditLogRepository({ db }) {
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
    const info = db
      .prepare(
        'INSERT INTO audit_logs (actor, action, entity, entity_id, diff, org_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(actor, action, entity, entityId, diffJson, orgId, createdAt);
    const row = db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(info.lastInsertRowid);
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

  return {
    create,
    list,
    count,
  };
}

// @ts-check
//
// PostgreSQL-backed audit log repository (issue #284). Same interface as
// `sqliteAuditLogRepository.js`.

function rowToAuditLog(row) {
  return {
    id: String(row.id),
    actor: row.actor,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id ?? null,
    diff: row.diff ?? null,
    timestamp: new Date(row.created_at).toISOString(),
  };
}

/**
 * @param {{ pool: import('pg').Pool }} opts
 */
export function createPgAuditLogRepository({ pool }) {
  async function create({
    actor,
    action,
    entity,
    entityId = null,
    diff = null,
    timestamp = null,
  }) {
    const createdAt = timestamp ?? new Date().toISOString();
    const { rows } = await pool.query(
      `
        INSERT INTO audit_logs (actor, action, entity, entity_id, diff, created_at)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
        RETURNING *
      `,
      [actor, action, entity, entityId, diff ? JSON.stringify(diff) : null, createdAt],
    );
    return rowToAuditLog(rows[0]);
  }

  async function list({ entity, entityId, action } = {}) {
    const filters = [];
    const params = [];
    let idx = 1;

    if (entity) {
      filters.push(`entity = $${idx++}`);
      params.push(entity);
    }
    if (entityId) {
      filters.push(`entity_id = $${idx++}`);
      params.push(String(entityId));
    }
    if (action) {
      filters.push(`action = $${idx++}`);
      params.push(action);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM audit_logs ${where} ORDER BY id DESC`,
      params,
    );
    return rows.map(rowToAuditLog);
  }

  return { create, list };
}

import { randomUUID } from 'node:crypto';

function rowToWebhook(row) {
  if (!row) return null;
  return {
    id: row.id,
    url: row.url,
    secret: row.secret,
    events: JSON.parse(row.events || '[]'),
    active: row.active === 1,
    description: row.description || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToDelivery(row) {
  if (!row) return null;
  let payload = null;
  try {
    payload = row.payload ? JSON.parse(row.payload) : null;
  } catch {
    payload = row.payload;
  }
  return {
    id: row.id,
    webhookId: row.webhook_id,
    event: row.event,
    payload,
    statusCode: row.status_code,
    error: row.error || null,
    attempts: row.attempts,
    nextRetryAt: row.next_retry_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSqliteWebhookRepository({ db }) {
  function create({ url, events, secret, description = '' }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const resolvedSecret = secret || randomUUID();
    const eventsJson = JSON.stringify(Array.isArray(events) ? events : []);

    db.prepare(`
      INSERT INTO webhooks (id, url, secret, events, active, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `).run(id, url, resolvedSecret, eventsJson, description, now, now);

    return {
      id,
      url,
      secret: resolvedSecret,
      events: Array.isArray(events) ? events : [],
      active: true,
      description,
      createdAt: now,
      updatedAt: now,
    };
  }

  function getById(id) {
    const row = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id);
    return rowToWebhook(row);
  }

  function list(filters = {}) {
    if (filters.active !== undefined) {
      const rows = db
        .prepare('SELECT * FROM webhooks WHERE active = ? ORDER BY created_at DESC')
        .all(filters.active ? 1 : 0);
      return rows.map(rowToWebhook);
    }
    return db.prepare('SELECT * FROM webhooks ORDER BY created_at DESC').all().map(rowToWebhook);
  }

  function update(id, updates) {
    const existing = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const merged = rowToWebhook(existing);

    if (updates.url !== undefined) merged.url = updates.url;
    if (updates.events !== undefined) merged.events = updates.events;
    if (updates.active !== undefined) merged.active = updates.active;
    if (updates.description !== undefined) merged.description = updates.description;
    if (updates.secret !== undefined) merged.secret = updates.secret;
    merged.updatedAt = now;

    db.prepare(`
      UPDATE webhooks
      SET url = ?, events = ?, active = ?, description = ?, secret = ?, updated_at = ?
      WHERE id = ?
    `).run(
      merged.url,
      JSON.stringify(merged.events),
      merged.active ? 1 : 0,
      merged.description,
      merged.secret,
      merged.updatedAt,
      id,
    );

    return merged;
  }

  function del(id) {
    const result = db.prepare('DELETE FROM webhooks WHERE id = ?').run(id);
    return result.changes > 0;
  }

  function recordDelivery({ webhookId, event, payload, statusCode, error }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const failed = statusCode >= 400 || statusCode === 0;
    const nextRetryAt = failed ? new Date(Date.now() + 60_000).toISOString() : null;
    const payloadJson = payload !== undefined ? JSON.stringify(payload) : null;

    db.prepare(`
      INSERT INTO webhook_deliveries
        (id, webhook_id, event, payload, status_code, error, attempts, next_retry_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(id, webhookId, event, payloadJson, statusCode, error || null, nextRetryAt, now, now);

    return {
      id,
      webhookId,
      event,
      payload,
      statusCode,
      error: error || null,
      attempts: 1,
      nextRetryAt,
      createdAt: now,
      updatedAt: now,
    };
  }

  function getDeliveryById(id) {
    const row = db.prepare('SELECT * FROM webhook_deliveries WHERE id = ?').get(id);
    return rowToDelivery(row);
  }

  function listDeliveries(webhookId, filters = {}) {
    const limit = filters.limit || 100;
    const rows = db
      .prepare(
        'SELECT * FROM webhook_deliveries WHERE webhook_id = ? ORDER BY created_at DESC LIMIT ?',
      )
      .all(webhookId, limit);
    return rows.map(rowToDelivery);
  }

  function getPendingRetries() {
    const now = new Date().toISOString();
    const rows = db
      .prepare(
        `SELECT * FROM webhook_deliveries
         WHERE next_retry_at IS NOT NULL AND next_retry_at <= ? AND attempts < 5`,
      )
      .all(now);
    return rows.map(rowToDelivery);
  }

  function updateDelivery(id, updates) {
    const existing = db.prepare('SELECT * FROM webhook_deliveries WHERE id = ?').get(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const merged = rowToDelivery(existing);

    if (updates.statusCode !== undefined) merged.statusCode = updates.statusCode;
    if (updates.error !== undefined) merged.error = updates.error;
    if (updates.attempts !== undefined) merged.attempts = updates.attempts;
    if ('nextRetryAt' in updates) merged.nextRetryAt = updates.nextRetryAt;
    merged.updatedAt = now;

    db.prepare(`
      UPDATE webhook_deliveries
      SET status_code = ?, error = ?, attempts = ?, next_retry_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      merged.statusCode,
      merged.error,
      merged.attempts,
      merged.nextRetryAt,
      merged.updatedAt,
      id,
    );

    return merged;
  }

  return {
    create,
    getById,
    list,
    update,
    delete: del,
    recordDelivery,
    getDeliveryById,
    listDeliveries,
    getPendingRetries,
    updateDelivery,
  };
}

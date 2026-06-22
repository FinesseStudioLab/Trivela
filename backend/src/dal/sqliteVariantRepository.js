// @ts-check

/**
 * Converts a database row to a variant object
 * @param {any} row
 */
function rowToVariant(row) {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    variantKey: row.variant_key,
    name: row.name,
    description: row.description || null,
    trafficWeight: row.traffic_weight,
    isControl: row.is_control === 1,
    active: row.active === 1,
    config: JSON.parse(row.config || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Converts a database row to an assignment object
 * @param {any} row
 */
function rowToAssignment(row) {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    variantId: String(row.variant_id),
    userId: row.user_id,
    assignedAt: row.assigned_at,
    sticky: row.sticky === 1,
  };
}

/**
 * Converts a database row to a result object
 * @param {any} row
 */
function rowToResult(row) {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    variantId: String(row.variant_id),
    metricName: row.metric_name,
    metricValue: row.metric_value,
    userId: row.user_id || null,
    recordedAt: row.recorded_at,
    metadata: JSON.parse(row.metadata || '{}'),
  };
}

export function createSqliteVariantRepository({ db }) {
  // Variant CRUD operations
  function createVariant({
    campaignId,
    variantKey,
    name,
    description = null,
    trafficWeight = 50,
    isControl = false,
    active = true,
    config = {},
  }) {
    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO campaign_variants (
          campaign_id, variant_key, name, description, traffic_weight, 
          is_control, active, config, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Number(campaignId),
        variantKey,
        name,
        description,
        trafficWeight,
        isControl ? 1 : 0,
        active ? 1 : 0,
        JSON.stringify(config),
        now,
        now,
      );

    return getVariantById(info.lastInsertRowid);
  }

  function getVariantById(id) {
    const row = db.prepare('SELECT * FROM campaign_variants WHERE id = ?').get(Number(id));
    return row ? rowToVariant(row) : undefined;
  }

  function getVariantByKey(campaignId, variantKey) {
    const row = db
      .prepare('SELECT * FROM campaign_variants WHERE campaign_id = ? AND variant_key = ?')
      .get(Number(campaignId), variantKey);
    return row ? rowToVariant(row) : undefined;
  }

  function listVariantsByCampaign(campaignId, { activeOnly = false } = {}) {
    const sql = activeOnly
      ? 'SELECT * FROM campaign_variants WHERE campaign_id = ? AND active = 1 ORDER BY is_control DESC, id ASC'
      : 'SELECT * FROM campaign_variants WHERE campaign_id = ? ORDER BY is_control DESC, id ASC';

    return db.prepare(sql).all(Number(campaignId)).map(rowToVariant);
  }

  function updateVariant(id, fields) {
    const allowed = ['name', 'description', 'trafficWeight', 'isControl', 'active', 'config'];
    const columnMap = {
      name: 'name',
      description: 'description',
      trafficWeight: 'traffic_weight',
      isControl: 'is_control',
      active: 'active',
      config: 'config',
    };
    const booleanFields = new Set(['isControl', 'active']);
    const sets = [];
    const values = [];

    for (const key of allowed) {
      if (!(key in fields)) continue;

      let value = fields[key];
      if (key === 'config') {
        value = JSON.stringify(value);
      }

      sets.push(`${columnMap[key]} = ?`);
      values.push(booleanFields.has(key) ? (value ? 1 : 0) : value);
    }

    if (sets.length === 0) {
      return getVariantById(id);
    }

    const updatedAt = new Date().toISOString();
    db.prepare(`UPDATE campaign_variants SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(
      ...values,
      updatedAt,
      Number(id),
    );
    return getVariantById(id);
  }

  function deleteVariant(id) {
    const info = db.prepare('DELETE FROM campaign_variants WHERE id = ?').run(Number(id));
    return info.changes > 0;
  }

  // Assignment operations
  function assignUserToVariant({ campaignId, variantId, userId, sticky = true }) {
    const now = new Date().toISOString();

    // Check if assignment already exists
    const existing = getUserAssignment(campaignId, userId);
    if (existing) {
      // If sticky, return existing assignment
      if (existing.sticky) {
        return existing;
      }
      // Otherwise, update the assignment
      db.prepare(
        'UPDATE variant_assignments SET variant_id = ?, assigned_at = ? WHERE campaign_id = ? AND user_id = ?',
      ).run(Number(variantId), now, Number(campaignId), userId);
    } else {
      // Create new assignment
      db.prepare(
        'INSERT INTO variant_assignments (campaign_id, variant_id, user_id, assigned_at, sticky) VALUES (?, ?, ?, ?, ?)',
      ).run(Number(campaignId), Number(variantId), userId, now, sticky ? 1 : 0);
    }

    return getUserAssignment(campaignId, userId);
  }

  function getUserAssignment(campaignId, userId) {
    const row = db
      .prepare('SELECT * FROM variant_assignments WHERE campaign_id = ? AND user_id = ?')
      .get(Number(campaignId), userId);
    return row ? rowToAssignment(row) : undefined;
  }

  function listAssignmentsByVariant(variantId, { limit = 100, offset = 0 } = {}) {
    return db
      .prepare(
        'SELECT * FROM variant_assignments WHERE variant_id = ? ORDER BY assigned_at DESC LIMIT ? OFFSET ?',
      )
      .all(Number(variantId), limit, offset)
      .map(rowToAssignment);
  }

  function getAssignmentStats(campaignId) {
    return db
      .prepare(
        `
      SELECT 
        v.id, 
        v.variant_key, 
        v.name,
        COUNT(va.id) as assignment_count
      FROM campaign_variants v
      LEFT JOIN variant_assignments va ON v.id = va.variant_id
      WHERE v.campaign_id = ?
      GROUP BY v.id
      ORDER BY v.is_control DESC, v.id ASC
    `,
      )
      .all(Number(campaignId))
      .map((row) => ({
        variantId: String(row.id),
        variantKey: row.variant_key,
        name: row.name,
        assignmentCount: row.assignment_count,
      }));
  }

  // Result tracking operations
  function recordResult({
    campaignId,
    variantId,
    metricName,
    metricValue,
    userId = null,
    metadata = {},
  }) {
    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO variant_results (
          campaign_id, variant_id, metric_name, metric_value, user_id, recorded_at, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Number(campaignId),
        Number(variantId),
        metricName,
        metricValue,
        userId,
        now,
        JSON.stringify(metadata),
      );

    return getResultById(info.lastInsertRowid);
  }

  function getResultById(id) {
    const row = db.prepare('SELECT * FROM variant_results WHERE id = ?').get(Number(id));
    return row ? rowToResult(row) : undefined;
  }

  /**
   * @param {number} campaignId
   * @param {{ variantId?: number, metricName?: string, limit?: number, offset?: number }} options
   */
  function listResults(campaignId, { variantId, metricName, limit = 100, offset = 0 } = {}) {
    const where = ['campaign_id = ?'];
    /** @type {Array<number | string>} */
    const params = [Number(campaignId)];

    if (variantId) {
      where.push('variant_id = ?');
      params.push(Number(variantId));
    }

    if (metricName) {
      where.push('metric_name = ?');
      params.push(metricName);
    }

    const sql = `
      SELECT * FROM variant_results 
      WHERE ${where.join(' AND ')} 
      ORDER BY recorded_at DESC 
      LIMIT ? OFFSET ?
    `;

    return db
      .prepare(sql)
      .all(...params, limit, offset)
      .map(rowToResult);
  }

  function getResultStats(campaignId, metricName) {
    return db
      .prepare(
        `
      SELECT 
        v.id,
        v.variant_key,
        v.name,
        COUNT(vr.id) as sample_count,
        AVG(vr.metric_value) as mean,
        MIN(vr.metric_value) as min,
        MAX(vr.metric_value) as max
      FROM campaign_variants v
      LEFT JOIN variant_results vr ON v.id = vr.variant_id AND vr.metric_name = ?
      WHERE v.campaign_id = ?
      GROUP BY v.id
      ORDER BY v.is_control DESC, v.id ASC
    `,
      )
      .all(metricName, Number(campaignId))
      .map((row) => ({
        variantId: String(row.id),
        variantKey: row.variant_key,
        name: row.name,
        sampleCount: row.sample_count,
        mean: row.mean || 0,
        min: row.min || 0,
        max: row.max || 0,
      }));
  }

  return {
    // Variant operations
    createVariant,
    getVariantById,
    getVariantByKey,
    listVariantsByCampaign,
    updateVariant,
    deleteVariant,

    // Assignment operations
    assignUserToVariant,
    getUserAssignment,
    listAssignmentsByVariant,
    getAssignmentStats,

    // Result operations
    recordResult,
    getResultById,
    listResults,
    getResultStats,
  };
}

/**
 * Analytics Service
 *
 * Privacy-respecting analytics for tracking user funnel progression.
 * - No PII collection
 * - Consent-aware
 * - Anonymized session IDs
 * - 90-day retention for raw events
 * - Self-hosted, no third-party trackers
 */

import crypto from 'node:crypto';
import { getDb } from '../db.js';
import logger from '../utils/logger.js';

const RETENTION_DAYS = 90;
const MAX_BATCH_SIZE = 100;

/**
 * Valid event names (from taxonomy)
 */
const VALID_EVENTS = new Set([
  // Wallet connection
  'wallet_connect_initiated',
  'wallet_connect_success',
  'wallet_connect_failed',

  // Registration
  'registration_viewed',
  'registration_initiated',
  'registration_tx_signed',
  'registration_success',
  'registration_failed',

  // Claim/Redeem
  'rewards_viewed',
  'claim_initiated',
  'claim_tx_signed',
  'claim_success',
  'claim_failed',

  // Campaign discovery
  'campaign_list_viewed',
  'campaign_card_clicked',
  'campaign_detail_viewed',

  // Campaign creation
  'campaign_create_started',
  'campaign_create_step_completed',
  'campaign_create_success',
  'campaign_create_abandoned',

  // Session
  'session_started',
  'page_viewed',

  // Technical (optional)
  'transaction_simulation_failed',
  'rpc_request_timeout',
]);

/**
 * Generate anonymized session ID
 * Uses random UUID + timestamp hash for uniqueness without tracking
 */
export function generateSessionId() {
  const random = crypto.randomUUID();
  const timestamp = Date.now();
  const hash = crypto
    .createHash('sha256')
    .update(`${random}:${timestamp}`)
    .digest('hex')
    .substring(0, 16);
  return `anon_${hash}`;
}

/**
 * Validate event structure
 */
function validateEvent(event) {
  if (!event.event_name || typeof event.event_name !== 'string') {
    return { valid: false, error: 'Missing or invalid event_name' };
  }

  if (!VALID_EVENTS.has(event.event_name)) {
    return { valid: false, error: `Unknown event: ${event.event_name}` };
  }

  if (!event.session_id || typeof event.session_id !== 'string') {
    return { valid: false, error: 'Missing or invalid session_id' };
  }

  if (!event.timestamp || !Date.parse(event.timestamp)) {
    return { valid: false, error: 'Missing or invalid timestamp' };
  }

  if (event.properties && typeof event.properties !== 'object') {
    return { valid: false, error: 'properties must be an object' };
  }

  // Ensure no PII in properties
  if (event.properties) {
    const piiFields = ['wallet_address', 'ip', 'email', 'name', 'address'];
    for (const field of piiFields) {
      if (event.properties[field]) {
        return { valid: false, error: `PII field '${field}' not allowed in properties` };
      }
    }
  }

  return { valid: true };
}

/**
 * Track a single analytics event
 */
export async function trackEvent(event) {
  const validation = validateEvent(event);
  if (!validation.valid) {
    logger.warn('Invalid analytics event:', validation.error);
    return { success: false, error: validation.error };
  }

  const db = getDb();

  try {
    const stmt = db.prepare(`
      INSERT INTO analytics_events (
        event_name,
        session_id,
        campaign_id,
        source,
        medium,
        campaign,
        properties,
        timestamp,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.event_name,
      event.session_id,
      event.campaign_id || null,
      event.source || null,
      event.medium || null,
      event.campaign || null,
      JSON.stringify(event.properties || {}),
      event.timestamp,
      new Date().toISOString(),
    );

    return { success: true };
  } catch (error) {
    logger.error('Failed to track event:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Track batch of events
 */
export async function trackEventBatch(events) {
  if (!Array.isArray(events)) {
    return { success: false, error: 'events must be an array' };
  }

  if (events.length === 0) {
    return { success: true, tracked: 0 };
  }

  if (events.length > MAX_BATCH_SIZE) {
    return { success: false, error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}` };
  }

  const results = [];
  for (const event of events) {
    const result = await trackEvent(event);
    results.push(result);
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  return {
    success: failureCount === 0,
    tracked: successCount,
    failed: failureCount,
  };
}

/**
 * Get funnel conversion metrics
 */
export async function getFunnelMetrics(options = {}) {
  const { startDate, endDate, source, medium, campaign, campaignId } = options;

  const db = getDb();

  // Build WHERE clause
  const conditions = [];
  const params = [];

  if (startDate) {
    conditions.push('timestamp >= ?');
    params.push(startDate);
  }

  if (endDate) {
    conditions.push('timestamp <= ?');
    params.push(endDate);
  }

  if (source) {
    conditions.push('source = ?');
    params.push(source);
  }

  if (medium) {
    conditions.push('medium = ?');
    params.push(medium);
  }

  if (campaign) {
    conditions.push('campaign = ?');
    params.push(campaign);
  }

  if (campaignId) {
    conditions.push('campaign_id = ?');
    params.push(campaignId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count events per stage
  const funnelQuery = `
    SELECT
      SUM(CASE WHEN event_name = 'session_started' THEN 1 ELSE 0 END) as sessions,
      SUM(CASE WHEN event_name = 'campaign_detail_viewed' THEN 1 ELSE 0 END) as campaign_views,
      SUM(CASE WHEN event_name = 'wallet_connect_initiated' THEN 1 ELSE 0 END) as connect_attempts,
      SUM(CASE WHEN event_name = 'wallet_connect_success' THEN 1 ELSE 0 END) as connect_success,
      SUM(CASE WHEN event_name = 'registration_initiated' THEN 1 ELSE 0 END) as registration_attempts,
      SUM(CASE WHEN event_name = 'registration_success' THEN 1 ELSE 0 END) as registration_success,
      SUM(CASE WHEN event_name = 'claim_initiated' THEN 1 ELSE 0 END) as claim_attempts,
      SUM(CASE WHEN event_name = 'claim_success' THEN 1 ELSE 0 END) as claim_success,
      SUM(CASE WHEN event_name = 'claim_success' AND json_extract(properties, '$.claim_type') = 'redeem' THEN 1 ELSE 0 END) as redeem_success
    FROM analytics_events
    ${whereClause}
  `;

  const counts = db.prepare(funnelQuery).get(...params);

  // Calculate conversion rates
  const funnel = {
    sessions: counts.sessions || 0,
    campaign_views: counts.campaign_views || 0,
    connect_attempts: counts.connect_attempts || 0,
    connect_success: counts.connect_success || 0,
    registration_attempts: counts.registration_attempts || 0,
    registration_success: counts.registration_success || 0,
    claim_attempts: counts.claim_attempts || 0,
    claim_success: counts.claim_success || 0,
    redeem_success: counts.redeem_success || 0,
  };

  // Calculate conversion rates (percentages)
  const conversions = {
    campaign_view_to_connect: calculateRate(funnel.connect_attempts, funnel.campaign_views),
    connect_attempt_to_success: calculateRate(funnel.connect_success, funnel.connect_attempts),
    connect_to_registration: calculateRate(funnel.registration_attempts, funnel.connect_success),
    registration_attempt_to_success: calculateRate(
      funnel.registration_success,
      funnel.registration_attempts,
    ),
    registration_to_claim: calculateRate(funnel.claim_attempts, funnel.registration_success),
    claim_attempt_to_success: calculateRate(funnel.claim_success, funnel.claim_attempts),
    claim_to_redeem: calculateRate(funnel.redeem_success, funnel.claim_success),
    overall_completion: calculateRate(funnel.redeem_success, funnel.campaign_views),
  };

  return {
    funnel,
    conversions,
    filters: { startDate, endDate, source, medium, campaign, campaignId },
  };
}

/**
 * Helper to calculate conversion rate
 */
function calculateRate(numerator, denominator) {
  if (!denominator || denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100; // 2 decimal places
}

/**
 * Get drop-off analysis
 */
export async function getDropOffAnalysis(options = {}) {
  const metrics = await getFunnelMetrics(options);
  const { funnel } = metrics;

  const stages = [
    { name: 'Campaign View', count: funnel.campaign_views },
    { name: 'Connect Attempt', count: funnel.connect_attempts },
    { name: 'Connect Success', count: funnel.connect_success },
    { name: 'Registration Attempt', count: funnel.registration_attempts },
    { name: 'Registration Success', count: funnel.registration_success },
    { name: 'Claim Attempt', count: funnel.claim_attempts },
    { name: 'Claim Success', count: funnel.claim_success },
    { name: 'Redeem Success', count: funnel.redeem_success },
  ];

  const dropoffs = [];
  for (let i = 0; i < stages.length - 1; i++) {
    const current = stages[i];
    const next = stages[i + 1];
    const dropped = current.count - next.count;
    const dropoffRate = current.count > 0 ? (dropped / current.count) * 100 : 0;

    dropoffs.push({
      from_stage: current.name,
      to_stage: next.name,
      dropped_count: dropped,
      dropoff_rate: Math.round(dropoffRate * 100) / 100,
    });
  }

  // Find highest drop-off
  const highestDropoff = dropoffs.reduce(
    (max, curr) => (curr.dropoff_rate > max.dropoff_rate ? curr : max),
    dropoffs[0] || { dropoff_rate: 0 },
  );

  return {
    stages,
    dropoffs,
    highest_dropoff: highestDropoff,
  };
}

/**
 * Get source attribution metrics
 */
export async function getSourceAttribution(options = {}) {
  const { startDate, endDate, campaignId } = options;
  const db = getDb();

  const conditions = [];
  const params = [];

  if (startDate) {
    conditions.push('timestamp >= ?');
    params.push(startDate);
  }

  if (endDate) {
    conditions.push('timestamp <= ?');
    params.push(endDate);
  }

  if (campaignId) {
    conditions.push('campaign_id = ?');
    params.push(campaignId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT
      COALESCE(source, 'direct') as source,
      COUNT(DISTINCT session_id) as sessions,
      SUM(CASE WHEN event_name = 'registration_success' THEN 1 ELSE 0 END) as registrations,
      SUM(CASE WHEN event_name = 'claim_success' THEN 1 ELSE 0 END) as claims
    FROM analytics_events
    ${whereClause}
    GROUP BY source
    ORDER BY sessions DESC
  `;

  const sources = db.prepare(query).all(...params);

  // Calculate conversion rates per source
  const attribution = sources.map((row) => ({
    source: row.source,
    sessions: row.sessions,
    registrations: row.registrations,
    claims: row.claims,
    registration_rate: calculateRate(row.registrations, row.sessions),
    claim_rate: calculateRate(row.claims, row.registrations),
  }));

  return attribution;
}

/**
 * Get retention metrics
 */
export async function getRetentionMetrics(options = {}) {
  const { cohortDate, campaignId } = options;
  const db = getDb();

  // This is a simplified version - production would track cohorts over time
  const query = `
    WITH user_first_activity AS (
      SELECT
        session_id,
        MIN(date(timestamp)) as first_date
      FROM analytics_events
      WHERE event_name = 'registration_success'
        ${campaignId ? 'AND campaign_id = ?' : ''}
      GROUP BY session_id
    ),
    user_return_activity AS (
      SELECT
        ae.session_id,
        ufa.first_date,
        COUNT(DISTINCT date(ae.timestamp)) as active_days
      FROM analytics_events ae
      JOIN user_first_activity ufa ON ae.session_id = ufa.session_id
      WHERE ae.event_name IN ('page_viewed', 'campaign_detail_viewed')
        ${campaignId ? 'AND ae.campaign_id = ?' : ''}
      GROUP BY ae.session_id, ufa.first_date
    )
    SELECT
      COUNT(*) as total_users,
      AVG(active_days) as avg_active_days,
      SUM(CASE WHEN active_days >= 2 THEN 1 ELSE 0 END) as day1_retained,
      SUM(CASE WHEN active_days >= 7 THEN 1 ELSE 0 END) as day7_retained,
      SUM(CASE WHEN active_days >= 30 THEN 1 ELSE 0 END) as day30_retained
    FROM user_return_activity
  `;

  const params = campaignId ? [campaignId, campaignId] : [];
  const retention = db.prepare(query).get(...params);

  return {
    total_users: retention?.total_users || 0,
    avg_active_days: Math.round((retention?.avg_active_days || 0) * 100) / 100,
    day1_retention_rate: calculateRate(retention?.day1_retained || 0, retention?.total_users || 0),
    day7_retention_rate: calculateRate(retention?.day7_retained || 0, retention?.total_users || 0),
    day30_retention_rate: calculateRate(
      retention?.day30_retained || 0,
      retention?.total_users || 0,
    ),
  };
}

/**
 * Clean up old events (retention policy)
 */
export async function cleanupOldEvents() {
  const db = getDb();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

  try {
    const stmt = db.prepare(`
      DELETE FROM analytics_events
      WHERE timestamp < ?
    `);

    const result = stmt.run(cutoffDate.toISOString());
    logger.info(`Cleaned up ${result.changes} old analytics events`);

    return { success: true, deleted: result.changes };
  } catch (error) {
    logger.error('Failed to cleanup old events:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Export events for analysis
 */
export async function exportEvents(options = {}) {
  const { startDate, endDate, eventNames, format = 'ndjson' } = options;
  const db = getDb();

  const conditions = [];
  const params = [];

  if (startDate) {
    conditions.push('timestamp >= ?');
    params.push(startDate);
  }

  if (endDate) {
    conditions.push('timestamp <= ?');
    params.push(endDate);
  }

  if (eventNames && eventNames.length > 0) {
    conditions.push(`event_name IN (${eventNames.map(() => '?').join(',')})`);
    params.push(...eventNames);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT *
    FROM analytics_events
    ${whereClause}
    ORDER BY timestamp ASC
  `;

  const events = db.prepare(query).all(...params);

  if (format === 'ndjson') {
    return events
      .map((event) =>
        JSON.stringify({
          event_name: event.event_name,
          timestamp: event.timestamp,
          session_id: event.session_id,
          campaign_id: event.campaign_id,
          source: event.source,
          medium: event.medium,
          campaign: event.campaign,
          properties: JSON.parse(event.properties || '{}'),
        }),
      )
      .join('\n');
  }

  return events;
}

export default {
  generateSessionId,
  trackEvent,
  trackEventBatch,
  getFunnelMetrics,
  getDropOffAnalysis,
  getSourceAttribution,
  getRetentionMetrics,
  cleanupOldEvents,
  exportEvents,
};

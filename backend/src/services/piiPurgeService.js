/**
 * PII Purge Service
 * Provides ability to purge personally identifiable information on request
 * (e.g., GDPR right to erasure).
 */

import { log } from '../middleware/logger.js';

/**
 * PII-related tables and their user-identifying columns
 */
const PII_TABLES = [
  { table: 'referrals', columns: ['referrer_address', 'referee_address'] },
  { table: 'referral_bonus_events', columns: ['referrer', 'referee'] },
  { table: 'allowlists', columns: ['address'] },
  { table: 'notifications', columns: ['user_id'] },
  { table: 'notification_channel_settings', columns: ['user_id'] },
  { table: 'notification_preferences', columns: ['user_address'] },
  { table: 'unsubscribe_tokens', columns: ['user_address'] },
  { table: 'push_subscriptions', columns: ['user'] },
  { table: 'claimable_balances', columns: ['user_address'] },
  { table: 'user_activities', columns: ['user_address'] },
  { table: 'variant_assignments', columns: ['user_id'] },
  { table: 'variant_results', columns: ['user_id'] },
  { table: 'balances', columns: ['user'] },
  { table: 'credit_events', columns: ['user'] },
  { table: 'claim_events', columns: ['user'] },
  { table: 'referral_credits', columns: ['referee', 'referrer'] },
  { table: 'participants', columns: ['user'] },
  { table: 'vesting_schedules', columns: ['user'] },
  { table: 'vested_claim_events', columns: ['user'] },
  { table: 'fee_bump_quota', columns: ['wallet'] },
  { table: 'sponsored_accounts', columns: ['address', 'sponsor_address'] },
  { table: 'operator_balance_log', columns: ['address'] },
  { table: 'organization_members', columns: ['user_email'] },
  { table: 'organization_invitations', columns: ['email'] },
];

/**
 * Purge PII for a specific user (wallet address or email)
 * @param {import('better-sqlite3').Database} db
 * @param {string} identifier - Wallet address or email to purge
 * @returns {{ purged: Array<{ table: string, count: number }> }}
 */
export function purgePiiForUser(db, identifier) {
  const purged = [];

  for (const { table, columns } of PII_TABLES) {
    for (const column of columns) {
      try {
        const stmt = db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`);
        const result = stmt.run(identifier);
        if (result.changes > 0) {
          purged.push({ table, count: result.changes });
          log.info(`[pii-purge] Deleted ${result.changes} rows from ${table} where ${column} = ?`);
        }
      } catch (err) {
        // Table might not exist or column might not match
        log.warn(`[pii-purge] Failed to purge ${table}.${column}: ${err.message}`);
      }
    }
  }

  // Also anonymize analytics events (strip PII from properties)
  try {
    const piiFields = ['wallet_address', 'ip', 'email', 'name', 'address', 'phone'];
    const events = db
      .prepare('SELECT id, properties FROM analytics_events WHERE properties LIKE ?')
      .all(`%${identifier}%`);

    for (const event of events) {
      try {
        const props = JSON.parse(event.properties);
        let modified = false;
        for (const field of piiFields) {
          if (props[field] === identifier) {
            props[field] = '[REDACTED]';
            modified = true;
          }
        }
        if (modified) {
          db.prepare('UPDATE analytics_events SET properties = ? WHERE id = ?').run(
            JSON.stringify(props),
            event.id,
          );
        }
      } catch {
        // Skip malformed JSON
      }
    }
    if (events.length > 0) {
      purged.push({ table: 'analytics_events', count: events.length });
    }
  } catch (err) {
    log.warn(`[pii-purge] Failed to anonymize analytics events: ${err.message}`);
  }

  return { purged };
}

/**
 * Fields that hold raw Web Push credential material rather than
 * human-meaningful data — replaced with a presence marker in exports so a
 * GDPR data-access request doesn't hand out live push-subscription secrets.
 */
const REDACTED_FIELDS = {
  push_subscriptions: ['p256dh', 'auth'],
};

/**
 * Export all PII for a specific user (wallet address or email), for GDPR
 * "right of access" requests. Reuses the same PII_TABLES map as
 * purgePiiForUser so "which tables hold this identifier" is defined once.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} identifier - Wallet address or email to export
 * @returns {{ identifier: string, exportedAt: string, data: Record<string, object[]> }}
 */
export function exportPiiForUser(db, identifier) {
  const data = {};

  for (const { table, columns } of PII_TABLES) {
    try {
      const where = columns.map((c) => `${c} = ?`).join(' OR ');
      const rows = db
        .prepare(`SELECT * FROM ${table} WHERE ${where}`)
        .all(...columns.map(() => identifier));

      if (rows.length > 0) {
        const redact = REDACTED_FIELDS[table];
        data[table] = redact
          ? rows.map((row) => ({
              ...row,
              ...Object.fromEntries(redact.map((field) => [field, '[REDACTED]'])),
            }))
          : rows;
      }
    } catch (err) {
      log.warn(`[pii-export] Failed to query ${table}: ${err.message}`);
    }
  }

  return { identifier, exportedAt: new Date().toISOString(), data };
}

/**
 * Purge PII for a specific campaign
 * @param {import('better-sqlite3').Database} db
 * @param {string|number} campaignId
 * @returns {{ purged: Array<{ table: string, count: number }> }}
 */
export function purgePiiForCampaign(db, campaignId) {
  const purged = [];
  const campaignSpecificTables = [
    { table: 'referrals', column: 'campaign_id' },
    { table: 'allowlists', column: 'campaign_id' },
    { table: 'user_activities', column: 'campaign_id' },
    { table: 'variant_assignments', column: 'campaign_id' },
    { table: 'variant_results', column: 'campaign_id' },
  ];

  for (const { table, column } of campaignSpecificTables) {
    try {
      const stmt = db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`);
      const result = stmt.run(Number(campaignId));
      if (result.changes > 0) {
        purged.push({ table, count: result.changes });
        log.info(
          `[pii-purge] Deleted ${result.changes} rows from ${table} for campaign ${campaignId}`,
        );
      }
    } catch (err) {
      log.warn(`[pii-purge] Failed to purge ${table} for campaign ${campaignId}: ${err.message}`);
    }
  }

  return { purged };
}

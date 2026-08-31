/**
 * Consent Service — Versioned terms acceptance with tamper-evident audit trail.
 *
 * Records versioned consent per user and maintains a hash-chained audit trail
 * for compliance and dispute resolution.
 *
 * Features:
 *   - Versioned consent: Each terms version is hashed and timestamped
 *   - Hash-chained trail: Each entry links to previous, creating tamper-evident log
 *   - Exportable: Full audit history can be exported as CSV/JSON
 *
 * Usage:
 *   const consentService = createConsentService({ db });
 *   await consentService.recordConsent(userId, 'v1.0.0', { ip, userAgent });
 *   const trail = await consentService.getAuditTrail(userId);
 */

import { createHash } from 'node:crypto';

// Genesis hash for the first entry in the chain
export const CONSENT_GENESIS_HASH = '0'.repeat(64);

/**
 * Canonical JSON serialization for deterministic hashing.
 */
function canonicalise(entry) {
  return JSON.stringify({
    seq: entry.seq ?? null,
    userId: entry.userId ?? null,
    action: entry.action ?? null,
    termsVersion: entry.termsVersion ?? null,
    timestamp: entry.timestamp ?? null,
    metadata: entry.metadata ?? null,
  });
}

/**
 * Compute hash of an entry, chained to previous entry.
 */
function computeEntryHash(prevHash, entry) {
  return createHash('sha256').update(prevHash).update(canonicalise(entry)).digest('hex');
}

/**
 * Create Consent Service.
 */
export function createConsentService({ db }) {
  // Ensure we have a valid database connection
  if (!db) {
    throw new Error('Database connection required');
  }

  // Cache for current terms version
  let currentTermsVersion = null;

  /**
   * Get the current terms version.
   */
  function getCurrentTerms() {
    if (currentTermsVersion) {
      return currentTermsVersion;
    }

    const stmt = db.prepare(`
      SELECT * FROM terms_versions WHERE is_current = 1 LIMIT 1
    `);
    currentTermsVersion = stmt.get();
    return currentTermsVersion;
  }

  /**
   * Get all terms versions.
   */
  function getAllTermsVersions() {
    const stmt = db.prepare(`
      SELECT id, version, content_hash, published_at, is_current
      FROM terms_versions
      ORDER BY published_at DESC
    `);
    return stmt.all();
  }

  /**
   * Publish a new terms version.
   */
  function publishTermsVersion(version, content) {
    const contentHash = createHash('sha256').update(content).digest('hex');
    const timestamp = new Date().toISOString();

    const stmt = db.prepare(`
      UPDATE terms_versions SET is_current = 0
    `);
    stmt.run();

    const insertStmt = db.prepare(`
      INSERT INTO terms_versions (version, content_hash, content, published_at, is_current)
      VALUES (?, ?, ?, ?, 1)
    `);
    insertStmt.run(version, `sha256:${contentHash}`, content, timestamp);

    currentTermsVersion = null;
    return { version, contentHash: `sha256:${contentHash}`, publishedAt: timestamp };
  }

  /**
   * Record user consent for a terms version.
   * Creates a hash-chained audit entry.
   */
  function recordConsent(userId, termsVersion, options = {}) {
    const { ipAddress, userAgent, consentType = 'terms', metadata = {} } = options;
    const timestamp = new Date().toISOString();

    return db.transaction(() => {
      // Check if already accepted
      const existingStmt = db.prepare(`
        SELECT id FROM user_consent
        WHERE user_id = ? AND terms_version = ? AND consent_type = ?
      `);
      const existing = existingStmt.get(userId, termsVersion, consentType);
      if (existing) {
        return { success: true, alreadyAccepted: true };
      }

      // Insert consent record
      const insertConsent = db.prepare(`
        INSERT INTO user_consent (user_id, terms_version, consent_type, accepted_at, ip_address, user_agent, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      insertConsent.run(userId, termsVersion, consentType, timestamp, ipAddress, userAgent, JSON.stringify(metadata));

      // Add to hash-chained audit trail
      const trailEntry = addAuditTrailEntry(userId, 'consent_accept', termsVersion, { ipAddress, userAgent, consentType });

      return {
        success: true,
        alreadyAccepted: false,
        auditEntry: trailEntry,
      };
    })();
  }

  /**
   * Add entry to hash-chained audit trail.
   */
  function addAuditTrailEntry(userId, action, termsVersion = null, metadata = {}) {
    const timestamp = new Date().toISOString();

    // Get last entry hash
    const lastEntryStmt = db.prepare(`
      SELECT seq, entry_hash FROM consent_audit_trail
      ORDER BY seq DESC LIMIT 1
    `);
    const lastEntry = lastEntryStmt.get();

    const prevHash = lastEntry?.entry_hash || CONSENT_GENESIS_HASH;
    const newSeq = (lastEntry?.seq ?? 0) + 1;

    const entry = {
      seq: newSeq,
      userId,
      action,
      termsVersion,
      timestamp,
      metadata,
    };

    const entryHash = computeEntryHash(prevHash, entry);

    const insertStmt = db.prepare(`
      INSERT INTO consent_audit_trail (seq, user_id, action, terms_version, prev_hash, entry_hash, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run(newSeq, userId, action, termsVersion, prevHash, entryHash, timestamp, JSON.stringify(metadata));

    return {
      seq: newSeq,
      entryHash,
      prevHash,
      timestamp,
    };
  }

  /**
   * Get user's consent history.
   */
  function getUserConsentHistory(userId) {
    const stmt = db.prepare(`
      SELECT
        uc.id,
        uc.terms_version,
        uc.consent_type,
        uc.accepted_at,
        uc.ip_address,
        uc.user_agent,
        uc.metadata,
        tv.content_hash,
        tv.published_at as terms_published_at
      FROM user_consent uc
      JOIN terms_versions tv ON uc.terms_version = tv.version
      WHERE uc.user_id = ?
      ORDER BY uc.accepted_at DESC
    `);
    return stmt.all(userId);
  }

  /**
   * Check if user has accepted current terms.
   */
  function hasAcceptedCurrentTerms(userId) {
    const current = getCurrentTerms();
    if (!current) return false;

    const stmt = db.prepare(`
      SELECT id FROM user_consent
      WHERE user_id = ? AND terms_version = ? AND consent_type = 'terms'
    `);
    return !!stmt.get(userId, current.version);
  }

  /**
   * Get full audit trail (optionally filtered by user).
   */
  function getAuditTrail(options = {}) {
    const { userId, startDate, endDate, limit = 100, offset = 0 } = options;

    let sql = `
      SELECT seq, user_id, action, terms_version, prev_hash, entry_hash, timestamp, metadata
      FROM consent_audit_trail
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    if (startDate) {
      sql += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND timestamp <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY seq DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * Verify audit trail integrity.
   * Returns true if hash chain is valid.
   */
  function verifyAuditTrailIntegrity() {
    const stmt = db.prepare(`
      SELECT seq, user_id, action, terms_version, prev_hash, entry_hash, timestamp, metadata
      FROM consent_audit_trail
      ORDER BY seq ASC
    `);
    const entries = stmt.all();

    let prevHash = CONSENT_GENESIS_HASH;

    for (const entry of entries) {
      const computedHash = computeEntryHash(prevHash, {
        seq: entry.seq,
        userId: entry.user_id,
        action: entry.action,
        termsVersion: entry.terms_version,
        timestamp: entry.timestamp,
        metadata: entry.metadata ? JSON.parse(entry.metadata) : null,
      });

      if (computedHash !== entry.entry_hash) {
        return {
          valid: false,
          error: `Hash mismatch at seq ${entry.seq}`,
          expected: computedHash,
          actual: entry.entry_hash,
        };
      }

      if (entry.prev_hash !== prevHash) {
        return {
          valid: false,
          error: `Previous hash mismatch at seq ${entry.seq}`,
          expected: prevHash,
          actual: entry.prev_hash,
        };
      }

      prevHash = entry.entry_hash;
    }

    return { valid: true };
  }

  /**
   * Export audit trail as CSV.
   */
  function exportAsCsv(options = {}) {
    const entries = getAuditTrail({ ...options, limit: 10000 });

    const headers = ['seq', 'user_id', 'action', 'terms_version', 'prev_hash', 'entry_hash', 'timestamp', 'metadata'];

    const rows = entries.map((entry) => [
      entry.seq,
      entry.user_id,
      entry.action,
      entry.terms_version || '',
      entry.prev_hash,
      entry.entry_hash,
      entry.timestamp,
      entry.metadata || '',
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return {
      content: csvContent,
      filename: `consent-audit-${new Date().toISOString().split('T')[0]}.csv`,
      mimeType: 'text/csv',
    };
  }

  /**
   * Export audit trail as JSON.
   */
  function exportAsJson(options = {}) {
    const entries = getAuditTrail({ ...options, limit: 10000 });

    const exportData = {
      exportedAt: new Date().toISOString(),
      integrity: verifyAuditTrailIntegrity(),
      entries,
    };

    return {
      content: JSON.stringify(exportData, null, 2),
      filename: `consent-audit-${new Date().toISOString().split('T')[0]}.json`,
      mimeType: 'application/json',
    };
  }

  /**
   * Revoke user consent (for compliance requests).
   */
  function revokeConsent(userId, consentType = 'terms') {
    return db.transaction(() => {
      const stmt = db.prepare(`
        DELETE FROM user_consent
        WHERE user_id = ? AND consent_type = ?
      `);
      stmt.run(userId, consentType);

      addAuditTrailEntry(userId, 'consent_revoke', null, { consentType });

      return { success: true };
    })();
  }

  return {
    getCurrentTerms,
    getAllTermsVersions,
    publishTermsVersion,
    recordConsent,
    getUserConsentHistory,
    hasAcceptedCurrentTerms,
    getAuditTrail,
    verifyAuditTrailIntegrity,
    exportAsCsv,
    exportAsJson,
    revokeConsent,
    CONSENT_GENESIS_HASH,
  };
}

export default createConsentService;

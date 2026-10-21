/**
 * Tests for Consent Service.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { createConsentService, CONSENT_GENESIS_HASH } from './consentService.js';

// Simple mock database for testing
function createMockDb() {
  const tables = {
    terms_versions: [
      { id: 1, version: 'v1.0.0', content_hash: 'sha256:abc123', content: 'Initial Terms', published_at: new Date().toISOString(), is_current: 1 }
    ],
    user_consent: [],
    consent_audit_trail: []
  };

  let lastSeq = 0;

  return {
    prepare: (sql) => {
      return {
        get: (...params) => {
          if (sql.includes('terms_versions') && sql.includes('is_current')) {
            return tables.terms_versions.find(t => t.is_current === 1);
          }
          if (sql.includes('user_consent') && sql.includes('user_id') && sql.includes('terms_version')) {
            return tables.user_consent.find(c => c.user_id === params[0] && c.terms_version === params[1] && c.consent_type === params[2]);
          }
          if (sql.includes('user_consent') && sql.includes('ORDER BY')) {
            return tables.user_consent.filter(c => c.user_id === params[0]);
          }
          if (sql.includes('consent_audit_trail') && sql.includes('ORDER BY seq DESC LIMIT 1')) {
            return tables.consent_audit_trail.length > 0 
              ? tables.consent_audit_trail[tables.consent_audit_trail.length - 1] 
              : null;
          }
          if (sql.includes('consent_audit_trail') && sql.includes('ORDER BY seq ASC')) {
            return tables.consent_audit_trail;
          }
          return undefined;
        },
        all: (...params) => {
          if (sql.includes('terms_versions') && sql.includes('ORDER BY')) {
            return tables.terms_versions;
          }
          if (sql.includes('user_consent') && sql.includes('ORDER BY')) {
            return tables.user_consent.filter(c => c.user_id === params[0]);
          }
          if (sql.includes('consent_audit_trail') && sql.includes('ORDER BY seq DESC')) {
            let results = [...tables.consent_audit_trail];
            if (params[0]) results = results.filter(e => e.user_id === params[0]);
            return results.slice(0, params[params.length - 2] || 100);
          }
          return [];
        },
        run: (...params) => {
          if (sql.includes('INSERT INTO user_consent')) {
            tables.user_consent.push({
              id: tables.user_consent.length + 1,
              user_id: params[0],
              terms_version: params[1],
              consent_type: params[2],
              accepted_at: params[3],
              ip_address: params[4],
              user_agent: params[5],
              metadata: params[6]
            });
            return { changes: 1 };
          }
          if (sql.includes('INSERT INTO consent_audit_trail')) {
            lastSeq++;
            tables.consent_audit_trail.push({
              seq: params[0],
              user_id: params[1],
              action: params[2],
              terms_version: params[3],
              prev_hash: params[4],
              entry_hash: params[5],
              timestamp: params[6],
              metadata: params[7]
            });
            return { changes: 1 };
          }
          if (sql.includes('DELETE FROM user_consent')) {
            tables.user_consent = tables.user_consent.filter(c => !(c.user_id === params[0] && c.consent_type === params[1]));
            return { changes: 1 };
          }
          if (sql.includes('UPDATE terms_versions')) {
            tables.terms_versions.forEach(t => t.is_current = 0);
            return { changes: 1 };
          }
          if (sql.includes('INSERT INTO terms_versions')) {
            tables.terms_versions.push({
              id: tables.terms_versions.length + 1,
              version: params[0],
              content_hash: params[1],
              content: params[2],
              published_at: params[3],
              is_current: 1
            });
            return { changes: 1 };
          }
          if (sql.includes('UPDATE consent_audit_trail')) {
            tables.consent_audit_trail.forEach(e => {
              if (e.seq === 1) e.entry_hash = 'tampered';
            });
            return { changes: 1 };
          }
          return { changes: 0 };
        }
      };
    },
    transaction: (fn) => () => fn(),
    exec: () => {}
  };
}

describe('ConsentService', () => {
  let db;
  let consentService;

  () => {
    db = createMockDb();
    consentService = createConsentService({ db });
  };

  describe('getCurrentTerms', () => {
    it('returns the current terms version', () => {
      db = createMockDb();
      consentService = createConsentService({ db });
      const terms = consentService.getCurrentTerms();
      assert.ok(terms);
      assert.strictEqual(terms.version, 'v1.0.0');
      assert.strictEqual(terms.is_current, 1);
    });
  });

  describe('getAllTermsVersions', () => {
    it('returns all terms versions', () => {
      db = createMockDb();
      consentService = createConsentService({ db });
      const versions = consentService.getAllTermsVersions();
      assert.strictEqual(versions.length, 1);
      assert.strictEqual(versions[0].version, 'v1.0.0');
    });
  });

  describe('recordConsent', () => {
    it('records user consent', () => {
      db = createMockDb();
      consentService = createConsentService({ db });
      const result = consentService.recordConsent('user-1', 'v1.0.0', {
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent',
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.alreadyAccepted, false);
      assert.ok(result.auditEntry);
      assert.strictEqual(result.auditEntry.seq, 1);
    });

    it('prevents duplicate consent records', () => {
      db = createMockDb();
      consentService = createConsentService({ db });
      consentService.recordConsent('user-1', 'v1.0.0');
      const result = consentService.recordConsent('user-1', 'v1.0.0');

      assert.strictEqual(result.alreadyAccepted, true);
    });
  });

  describe('hasAcceptedCurrentTerms', () => {
    it('returns false for user who has not accepted', () => {
      db = createMockDb();
      consentService = createConsentService({ db });
      const accepted = consentService.hasAcceptedCurrentTerms('user-1');
      assert.strictEqual(accepted, false);
    });

    it('returns true for user who has accepted', () => {
      db = createMockDb();
      consentService = createConsentService({ db });
      consentService.recordConsent('user-1', 'v1.0.0');
      const accepted = consentService.hasAcceptedCurrentTerms('user-1');
      assert.strictEqual(accepted, true);
    });
  });

  describe('getAuditTrail', () => {
    it('returns all entries when no filter', () => {
      db = createMockDb();
      consentService = createConsentService({ db });
      consentService.recordConsent('user-1', 'v1.0.0');
      consentService.recordConsent('user-2', 'v1.0.0');

      const trail = consentService.getAuditTrail();
      assert.ok(trail.length >= 2);
    });

    it('filters by user', () => {
      db = createMockDb();
      consentService = createConsentService({ db });
      consentService.recordConsent('user-1', 'v1.0.0');
      consentService.recordConsent('user-2', 'v1.0.0');

      const trail = consentService.getAuditTrail({ userId: 'user-1' });
      assert.strictEqual(trail.length, 1);
      assert.strictEqual(trail[0].user_id, 'user-1');
    });
  });

  describe('verifyAuditTrailIntegrity', () => {
    it('returns valid for empty trail', () => {
      db = createMockDb();
      consentService = createConsentService({ db });
      const result = consentService.verifyAuditTrailIntegrity();
      assert.strictEqual(result.valid, true);
    });

    it('returns valid for correct hash chain', () => {
      db = createMockDb();
      consentService = createConsentService({ db });
      consentService.recordConsent('user-1', 'v1.0.0');
      consentService.recordConsent('user-2', 'v1.0.0');

      const result = consentService.verifyAuditTrailIntegrity();
      assert.strictEqual(result.valid, true);
    });
  });

  describe('revokeConsent', () => {
    it('removes consent and creates audit entry', () => {
      db = createMockDb();
      consentService = createConsentService({ db });
      consentService.recordConsent('user-1', 'v1.0.0');
      const result = consentService.revokeConsent('user-1');

      assert.strictEqual(result.success, true);

      const accepted = consentService.hasAcceptedCurrentTerms('user-1');
      assert.strictEqual(accepted, false);
    });
  });
});

// @ts-check
export const version = 18;
export const description = 'Add versioned consent and audit trail for policy acceptance (#581)';

export function up(db) {
  // Terms/Policy versions
  db.exec(`
    CREATE TABLE IF NOT EXISTS terms_versions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      version     TEXT NOT NULL UNIQUE,
      content_hash TEXT NOT NULL,
      content     TEXT NOT NULL,
      published_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_current  INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_terms_versions_version ON terms_versions(version);
    CREATE INDEX IF NOT EXISTS idx_terms_versions_current ON terms_versions(is_current);
  `);

  // User consent records
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_consent (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL,
      terms_version TEXT NOT NULL,
      consent_type TEXT NOT NULL DEFAULT 'terms',
      accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
      ip_address  TEXT,
      user_agent  TEXT,
      metadata    TEXT,
      FOREIGN KEY (terms_version) REFERENCES terms_versions(version)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_consent_unique 
      ON user_consent(user_id, terms_version, consent_type);
    CREATE INDEX IF NOT EXISTS idx_user_consent_user ON user_consent(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_consent_terms ON user_consent(terms_version);
    CREATE INDEX IF NOT EXISTS idx_user_consent_accepted ON user_consent(accepted_at);
  `);

  // Consent audit trail (hash-chained)
  db.exec(`
    CREATE TABLE IF NOT EXISTS consent_audit_trail (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      seq         INTEGER UNIQUE,
      user_id     TEXT NOT NULL,
      action      TEXT NOT NULL,
      terms_version TEXT,
      prev_hash   TEXT NOT NULL,
      entry_hash  TEXT NOT NULL,
      timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
      metadata    TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_consent_audit_seq ON consent_audit_trail(seq);
    CREATE INDEX IF NOT EXISTS idx_consent_audit_user ON consent_audit_trail(user_id);
    CREATE INDEX IF NOT EXISTS idx_consent_audit_timestamp ON consent_audit_trail(timestamp);
  `);

  // Insert initial terms version
  db.exec(`
    INSERT INTO terms_versions (version, content_hash, content, is_current)
    VALUES (
      'v1.0.0',
      'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      'Initial Terms of Service and Privacy Policy',
      1
    );
  `);
}

export function down(db) {
  db.exec(`
    DROP TABLE IF EXISTS consent_audit_trail;
    DROP TABLE IF EXISTS user_consent;
    DROP TABLE IF EXISTS terms_versions;
  `);
}

export const migration = {
  name: '046_session_tokens',
  description: 'Add session_tokens table for temporary session token storage and cleanup',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_tokens (
        id TEXT PRIMARY KEY,
        user_address TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_session_tokens_user
        ON session_tokens(user_address);

      CREATE INDEX IF NOT EXISTS idx_session_tokens_expires
        ON session_tokens(expires_at);

      CREATE INDEX IF NOT EXISTS idx_session_tokens_token
        ON session_tokens(token);
    `);
  },
};

// The migration runner reads `version`/`description`/`up` as named exports.
// Versions 46-48 are already taken by the other migrations that share those
// file numbers, so these use the next free numbers.
export const version = 49;
export const description = migration.description;
export const up = migration.up;

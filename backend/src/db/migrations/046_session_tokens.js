export const version = 46;
export const description = 'Add session_tokens table for temporary session token storage and cleanup';

export function up(db) {
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
}

import { randomUUID } from 'crypto';

export function createSqliteSessionTokenRepository({ db }) {
  const stmtInsert = db.prepare(`
    INSERT INTO session_tokens (id, user_address, token, expires_at)
    VALUES (?, ?, ?, ?)
  `);

  const stmtGetByToken = db.prepare(`
    SELECT id, user_address, token, expires_at, created_at
    FROM session_tokens
    WHERE token = ? AND expires_at > datetime('now')
  `);

  const stmtGetByUser = db.prepare(`
    SELECT id, user_address, token, expires_at, created_at
    FROM session_tokens
    WHERE user_address = ? AND expires_at > datetime('now')
    ORDER BY created_at DESC
  `);

  const stmtDeleteExpired = db.prepare(`
    DELETE FROM session_tokens
    WHERE expires_at <= datetime('now')
  `);

  const stmtDeleteByToken = db.prepare(`
    DELETE FROM session_tokens
    WHERE token = ?
  `);

  const stmtCountExpired = db.prepare(`
    SELECT COUNT(*) as count
    FROM session_tokens
    WHERE expires_at <= datetime('now')
  `);

  return {
    create(userAddress, expiresAt) {
      const token = randomUUID();
      const id = `sess_${randomUUID()}`;
      stmtInsert.run(id, userAddress, token, expiresAt.toISOString());
      return { id, userAddress, token, expiresAt };
    },

    getByToken(token) {
      const row = stmtGetByToken.get(token);
      if (!row) return null;
      return {
        id: row.id,
        userAddress: row.user_address,
        token: row.token,
        expiresAt: new Date(row.expires_at),
        createdAt: new Date(row.created_at),
      };
    },

    getByUser(userAddress) {
      const rows = stmtGetByUser.all(userAddress);
      return rows.map((row) => ({
        id: row.id,
        userAddress: row.user_address,
        token: row.token,
        expiresAt: new Date(row.expires_at),
        createdAt: new Date(row.created_at),
      }));
    },

    deleteExpired() {
      const countBefore = stmtCountExpired.get().count;
      stmtDeleteExpired.run();
      const countAfter = stmtCountExpired.get().count;
      return countBefore - countAfter;
    },

    deleteByToken(token) {
      stmtDeleteByToken.run(token);
    },

    getExpiredCount() {
      return stmtCountExpired.get().count;
    },
  };
}

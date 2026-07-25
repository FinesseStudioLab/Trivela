export function createSqliteNotificationRepository({ db }) {
  return {
    create({ userId, campaignId, title, message, type = 'reward' }) {
      const stmt = db.prepare(`
        INSERT INTO notifications (user_id, campaign_id, title, message, type)
        VALUES (?, ?, ?, ?, ?)
      `);
      const result = stmt.run(userId, campaignId, title, message, type);
      return { id: result.lastInsertRowid };
    },

    listByUserId({ userId, limit = 50, offset = 0 }) {
      const stmt = db.prepare(`
        SELECT id, user_id, campaign_id, title, message, type, read, created_at, read_at
        FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `);
      return stmt.all(userId, limit, offset);
    },

    getUnreadCount(userId) {
      const stmt = db.prepare(`
        SELECT COUNT(*) as count
        FROM notifications
        WHERE user_id = ? AND read = 0
      `);
      return stmt.get(userId)?.count ?? 0;
    },

    markAsRead(notificationId) {
      const stmt = db.prepare(`
        UPDATE notifications
        SET read = 1, read_at = datetime('now')
        WHERE id = ?
      `);
      stmt.run(notificationId);
    },

    markAllAsRead(userId) {
      const stmt = db.prepare(`
        UPDATE notifications
        SET read = 1, read_at = datetime('now')
        WHERE user_id = ? AND read = 0
      `);
      stmt.run(userId);
    },

    deleteOlderThan(days) {
      const stmt = db.prepare(`
        DELETE FROM notifications
        WHERE created_at < datetime('now', '-' || ? || ' days')
      `);
      stmt.run(days);
    },
  };
}

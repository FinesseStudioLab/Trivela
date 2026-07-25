export const version = 25;
export const description = 'Notifications table with read/unread state for in-app inbox (#1027)';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           TEXT NOT NULL,
      campaign_id       INTEGER,
      title             TEXT NOT NULL,
      message           TEXT NOT NULL,
      type              TEXT NOT NULL DEFAULT 'reward',
      read              INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      read_at           TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
  `);
}

export function createSqliteNotificationPreferencesRepository({ db }) {
  return {
    getOrCreate(userId) {
      let prefs = this.get(userId);
      if (!prefs) {
        const stmt = db.prepare(`
          INSERT OR IGNORE INTO notification_preferences (user_id)
          VALUES (?)
        `);
        stmt.run(userId);
        prefs = this.get(userId);
      }
      return prefs;
    },

    get(userId) {
      const stmt = db.prepare(`
        SELECT id, user_id, email_enabled, sms_enabled, whatsapp_enabled, phone_number, created_at, updated_at
        FROM notification_preferences
        WHERE user_id = ?
      `);
      return stmt.get(userId);
    },

    update({ userId, emailEnabled, smsEnabled, whatsappEnabled, phoneNumber }) {
      const stmt = db.prepare(`
        UPDATE notification_preferences
        SET email_enabled = COALESCE(?, email_enabled),
            sms_enabled = COALESCE(?, sms_enabled),
            whatsapp_enabled = COALESCE(?, whatsapp_enabled),
            phone_number = COALESCE(?, phone_number),
            updated_at = datetime('now')
        WHERE user_id = ?
      `);
      stmt.run(emailEnabled, smsEnabled, whatsappEnabled, phoneNumber, userId);
    },
  };
}

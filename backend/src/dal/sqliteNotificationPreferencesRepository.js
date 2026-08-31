// @ts-check
import crypto from 'node:crypto';

/**
 * SQLite-backed repository for user notification preferences and unsubscribe
 * tokens.
 *
 * Two preference models live side by side, because they answer different
 * questions and are stored in different tables:
 *
 *   - per-(user, channel, event_type) opt-in (#1026), in
 *     `notification_preferences` — `setPreference` / `getPreferences` /
 *     `createUnsubscribeToken` / `applyUnsubscribeToken`, used by
 *     routes/notificationPreferences.js
 *   - per-user channel toggles with a phone number for SMS/WhatsApp (#1028),
 *     in `notification_channel_settings` — `getOrCreate` / `get` / `update`
 *
 * @param {{ db: InstanceType<import('better-sqlite3')> }} opts
 */
export function createSqliteNotificationPreferencesRepository({ db }) {
  const upsertPref = db.prepare(`
    INSERT INTO notification_preferences (user_address, channel, event_type, enabled, updated_at)
    VALUES (@userAddress, @channel, @eventType, @enabled, @updatedAt)
    ON CONFLICT(user_address, channel, event_type)
    DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at
  `);

  const getPrefs = db.prepare(`
    SELECT channel, event_type, enabled
    FROM notification_preferences
    WHERE user_address = ?
    ORDER BY channel, event_type
  `);

  const insertToken = db.prepare(`
    INSERT INTO unsubscribe_tokens (token, user_address, channel, created_at)
    VALUES (@token, @userAddress, @channel, @createdAt)
  `);

  const getToken = db.prepare(`
    SELECT * FROM unsubscribe_tokens WHERE token = ? AND used_at IS NULL
  `);

  const markTokenUsed = db.prepare(`
    UPDATE unsubscribe_tokens SET used_at = ? WHERE token = ?
  `);

  const disableChannel = db.prepare(`
    INSERT INTO notification_preferences (user_address, channel, event_type, enabled, updated_at)
    VALUES (@userAddress, @channel, '*', 0, @updatedAt)
    ON CONFLICT(user_address, channel, event_type)
    DO UPDATE SET enabled = 0, updated_at = excluded.updated_at
  `);

  const insertSettings = db.prepare(`
    INSERT OR IGNORE INTO notification_channel_settings (user_id) VALUES (?)
  `);

  const getSettings = db.prepare(`
    SELECT id, user_id, email_enabled, sms_enabled, whatsapp_enabled, phone_number,
           created_at, updated_at
    FROM notification_channel_settings
    WHERE user_id = ?
  `);

  const updateSettings = db.prepare(`
    UPDATE notification_channel_settings
    SET email_enabled    = COALESCE(?, email_enabled),
        sms_enabled      = COALESCE(?, sms_enabled),
        whatsapp_enabled = COALESCE(?, whatsapp_enabled),
        phone_number     = COALESCE(?, phone_number),
        updated_at       = datetime('now')
    WHERE user_id = ?
  `);

  return {
    /**
     * Set a preference for a specific (user, channel, event_type) tuple.
     * Pass event_type '*' to set a catch-all for the channel.
     * @param {string} userAddress
     * @param {string} channel  e.g. 'email' | 'push' | 'in_app'
     * @param {string} eventType  e.g. 'claim_reward' | '*'
     * @param {boolean} enabled
     */
    setPreference(userAddress, channel, eventType, enabled) {
      upsertPref.run({
        userAddress,
        channel,
        eventType: eventType ?? '*',
        enabled: enabled ? 1 : 0,
        updatedAt: new Date().toISOString(),
      });
    },

    /**
     * Return all stored preferences for a user.
     * @param {string} userAddress
     * @returns {{ channel: string; eventType: string; enabled: boolean }[]}
     */
    getPreferences(userAddress) {
      return /** @type {any[]} */ (getPrefs.all(userAddress)).map((row) => ({
        channel: row.channel,
        eventType: row.event_type,
        enabled: row.enabled === 1,
      }));
    },

    /**
     * Generate a one-time unsubscribe token for a user / channel.
     * @param {string} userAddress
     * @param {string|null} channel  null means "all channels"
     * @returns {string} the opaque token
     */
    createUnsubscribeToken(userAddress, channel) {
      const token = crypto.randomBytes(32).toString('hex');
      insertToken.run({
        token,
        userAddress,
        channel: channel ?? null,
        createdAt: new Date().toISOString(),
      });
      return token;
    },

    /**
     * Honour an unsubscribe token: disable the relevant channel (or all channels)
     * and mark the token as consumed.
     * @param {string} token
     * @returns {{ ok: boolean; userAddress?: string; channel?: string|null }}
     */
    applyUnsubscribeToken(token) {
      const row = /** @type {any} */ (getToken.get(token));
      if (!row) return { ok: false };

      const now = new Date().toISOString();
      const channels = row.channel ? [row.channel] : ['email', 'push', 'in_app'];

      for (const ch of channels) {
        disableChannel.run({ userAddress: row.user_address, channel: ch, updatedAt: now });
      }
      markTokenUsed.run(now, token);

      return { ok: true, userAddress: row.user_address, channel: row.channel };
    },

    // ── Per-user channel settings (#1028) ────────────────────────────────────

    /**
     * Fetch a user's channel settings, creating the default row on first use.
     * @param {string} userId
     */
    getOrCreate(userId) {
      let settings = this.get(userId);
      if (!settings) {
        insertSettings.run(userId);
        settings = this.get(userId);
      }
      return settings;
    },

    /**
     * @param {string} userId
     * @returns {any} the settings row, or undefined when the user has none
     */
    get(userId) {
      return getSettings.get(userId);
    },

    /**
     * Partial update — `null`/`undefined` fields keep their stored value.
     * @param {{ userId: string, emailEnabled?: number|null, smsEnabled?: number|null,
     *           whatsappEnabled?: number|null, phoneNumber?: string|null }} patch
     */
    update({ userId, emailEnabled, smsEnabled, whatsappEnabled, phoneNumber }) {
      updateSettings.run(
        emailEnabled ?? null,
        smsEnabled ?? null,
        whatsappEnabled ?? null,
        phoneNumber ?? null,
        userId,
      );
    },
  };
}

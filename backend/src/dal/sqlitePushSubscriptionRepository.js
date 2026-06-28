// @ts-check

/**
 * Maps a DB row to a Web Push subscription object (PushSubscription-shaped).
 */
function rowToSubscription(row) {
  return {
    user: row.user,
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
    userAgent: row.user_agent ?? null,
    createdAt: row.created_at,
  };
}

/**
 * SQLite-backed store for Web Push subscriptions.
 *
 * Subscriptions are unique per `endpoint` (the browser-issued push endpoint),
 * so re-subscribing the same device upserts rather than duplicating — this is
 * the per-device dedupe required by issue #619.
 *
 * @param {{ db: InstanceType<import('better-sqlite3')> }} params
 */
export function createSqlitePushSubscriptionRepository({ db }) {
  const upsertStmt = db.prepare(`
    INSERT INTO push_subscriptions (user, endpoint, p256dh, auth, user_agent, created_at)
    VALUES (@user, @endpoint, @p256dh, @auth, @userAgent, @createdAt)
    ON CONFLICT(endpoint) DO UPDATE SET
      user       = excluded.user,
      p256dh     = excluded.p256dh,
      auth       = excluded.auth,
      user_agent = excluded.user_agent
  `);

  const listByUserStmt = db.prepare(`SELECT * FROM push_subscriptions WHERE user = ?`);
  const deleteByEndpointStmt = db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`);

  return {
    /**
     * Insert or update a subscription, keyed by endpoint (dedupe per device).
     * @param {{ user: string, endpoint: string, p256dh: string, auth: string, userAgent?: string|null, createdAt?: number }} sub
     */
    save({ user, endpoint, p256dh, auth, userAgent = null, createdAt = Date.now() }) {
      upsertStmt.run({ user, endpoint, p256dh, auth, userAgent, createdAt });
    },

    /** All subscriptions for a user. @param {string} user */
    listByUser(user) {
      return listByUserStmt.all(user).map(rowToSubscription);
    },

    /** Remove a single subscription by endpoint. @returns {number} rows removed */
    deleteByEndpoint(endpoint) {
      return deleteByEndpointStmt.run(endpoint).changes;
    },

    /**
     * Remove many subscriptions by endpoint in one transaction. Used to prune
     * stale/expired subscriptions the push service reported as gone (410/404).
     * @param {string[]} endpoints
     * @returns {number} total rows removed
     */
    deleteByEndpoints(endpoints) {
      let removed = 0;
      const tx = db.transaction((eps) => {
        for (const endpoint of eps) {
          removed += deleteByEndpointStmt.run(endpoint).changes;
        }
      });
      tx(endpoints);
      return removed;
    },
  };
}

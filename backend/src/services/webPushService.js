// @ts-check
import webpush from 'web-push';

/**
 * Web Push (VAPID) delivery service for issue #619.
 *
 * Sends notifications for campaign-lifecycle events (credit available, ending
 * soon, claim ready) to a user's subscribed devices and prunes subscriptions
 * the push service reports as gone (HTTP 404/410). When VAPID keys are not
 * configured the service is a no-op (`isConfigured() === false`) so the backend
 * still boots and tests run without push secrets.
 *
 * @param {Object} params
 * @param {ReturnType<import('../dal/sqlitePushSubscriptionRepository.js').createSqlitePushSubscriptionRepository>} params.repository
 * @param {{ publicKey?: string, privateKey?: string, subject?: string }} [params.vapid]
 * @param {Object} [params.logger]
 * @param {(subscription: object, payload: string) => Promise<unknown>} [params.sender] - injectable for tests
 */
export function createWebPushService({ repository, vapid = {}, logger = console, sender }) {
  const configured = Boolean(vapid.publicKey && vapid.privateKey);

  if (configured && !sender) {
    webpush.setVapidDetails(
      vapid.subject || 'mailto:notifications@trivela.app',
      /** @type {string} */ (vapid.publicKey),
      /** @type {string} */ (vapid.privateKey),
    );
  }

  const send =
    sender || ((subscription, payload) => webpush.sendNotification(subscription, payload));

  return {
    /** Whether VAPID keys are configured (push enabled). */
    isConfigured() {
      return configured;
    },

    /** The VAPID public key clients need to subscribe, or null when disabled. */
    getPublicKey() {
      return configured ? vapid.publicKey : null;
    },

    /**
     * Send a notification payload to every device a user is subscribed on.
     * Stale subscriptions (404/410) are pruned. Other send errors are logged
     * but do not abort the fan-out to the user's remaining devices.
     *
     * @param {string} user
     * @param {object} payload - serialized to JSON and delivered to the SW
     * @returns {Promise<{ sent: number, pruned: number, skipped?: boolean }>}
     */
    async sendToUser(user, payload) {
      if (!configured) {
        return { sent: 0, pruned: 0, skipped: true };
      }

      const subscriptions = repository.listByUser(user);
      const body = JSON.stringify(payload);
      const stale = [];
      let sent = 0;

      for (const sub of subscriptions) {
        try {
          await send({ endpoint: sub.endpoint, keys: sub.keys }, body);
          sent += 1;
        } catch (err) {
          const status = err?.statusCode;
          if (status === 404 || status === 410) {
            stale.push(sub.endpoint);
          } else {
            logger.error?.(`webPush:send failed user=${user} status=${status ?? 'unknown'}`, err);
          }
        }
      }

      const pruned = stale.length > 0 ? repository.deleteByEndpoints(stale) : 0;
      return { sent, pruned };
    },
  };
}

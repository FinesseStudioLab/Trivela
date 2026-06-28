// @ts-check
import express from 'express';

function isValidSubscription(subscription) {
  return Boolean(
    subscription &&
    typeof subscription.endpoint === 'string' &&
    subscription.keys &&
    typeof subscription.keys.p256dh === 'string' &&
    typeof subscription.keys.auth === 'string',
  );
}

/**
 * Web Push subscription routes (issue #619).
 *
 * - `GET  /push/vapid-public-key` — the VAPID public key clients subscribe with.
 * - `POST /push/subscribe`        — store a browser PushSubscription for a user.
 * - `POST /push/unsubscribe`      — remove a subscription by endpoint.
 *
 * @param {Object} params
 * @param {ReturnType<import('../dal/sqlitePushSubscriptionRepository.js').createSqlitePushSubscriptionRepository>} params.repository
 * @param {ReturnType<import('../services/webPushService.js').createWebPushService>} params.service
 */
export function createPushRoutes({ repository, service }) {
  const router = express.Router();

  router.get('/push/vapid-public-key', (req, res) => {
    const publicKey = service.getPublicKey();
    if (!publicKey) {
      return res.status(503).json({ error: 'push_not_configured' });
    }
    res.json({ publicKey });
  });

  router.post('/push/subscribe', (req, res) => {
    const { user, subscription } = req.body ?? {};
    if (!user || typeof user !== 'string') {
      return res.status(400).json({ error: 'user_required' });
    }
    if (!isValidSubscription(subscription)) {
      return res.status(400).json({ error: 'invalid_subscription' });
    }

    repository.save({
      user,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: req.get('user-agent') ?? null,
    });

    res.status(201).json({ ok: true });
  });

  router.post('/push/unsubscribe', (req, res) => {
    const { endpoint } = req.body ?? {};
    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ error: 'endpoint_required' });
    }
    const removed = repository.deleteByEndpoint(endpoint);
    res.json({ ok: true, removed });
  });

  return router;
}

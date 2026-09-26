// @ts-check
import express, { Router } from 'express';
import { extractVerifiedTask, verifyGithubSignature } from '../services/githubWebhook.js';

/**
 * GitHub webhook listener (#1256).
 *
 *   POST /webhooks/github  (public; authenticated by the HMAC signature)
 *
 * Mount this BEFORE the global `express.json()` — the signature is computed
 * over the exact bytes GitHub sent, so the body is parsed here from the raw
 * buffer.
 *
 * @param {{
 *   store: ReturnType<import('../services/githubWebhook.js').createGithubTaskStore>,
 *   getSecret: () => string,
 *   logger?: { warn?: Function },
 * }} options
 */
export function createGithubWebhookRoutes({ store, getSecret, logger = console }) {
  const router = Router();

  router.post('/webhooks/github', express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
    const secret = getSecret();
    if (!secret) {
      return res
        .status(503)
        .json({ error: 'GitHub webhook is not configured', code: 'GITHUB_WEBHOOK_NOT_CONFIGURED' });
    }

    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const signature = req.get('x-hub-signature-256');
    if (!verifyGithubSignature(raw, signature, secret)) {
      logger.warn?.('github:webhook invalid signature');
      return res.status(401).json({ error: 'Invalid signature', code: 'INVALID_SIGNATURE' });
    }

    const event = req.get('x-github-event') ?? '';
    const deliveryId = req.get('x-github-delivery') ?? '';
    if (event === 'ping') return res.status(200).json({ ok: true, event: 'ping' });
    if (!deliveryId) {
      return res.status(400).json({ error: 'Missing X-GitHub-Delivery', code: 'VALIDATION_ERROR' });
    }

    /** @type {Record<string, any>} */
    let payload;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload', code: 'VALIDATION_ERROR' });
    }

    const task = extractVerifiedTask(event, payload);
    if (!task) return res.status(202).json({ ok: true, ignored: true, event });

    const recorded = store.record(deliveryId, task);
    return res
      .status(recorded ? 201 : 200)
      .json({
        ok: true,
        verified: true,
        duplicate: !recorded,
        kind: task.kind,
        repo: task.repo,
        number: task.number,
      });
  });

  return router;
}

/**
 * Master-key API to look up verified tasks before crediting a reward.
 *
 *   GET /?githubLogin=&repo=&limit=
 *   GET /verify?githubLogin=&repo=&number=&kind=
 * (mounted at /admin/github-tasks)
 *
 * @param {{ store: ReturnType<import('../services/githubWebhook.js').createGithubTaskStore> }} options
 */
export function createGithubTaskRoutes({ store }) {
  const router = Router();

  router.get('/verify', (req, res) => {
    const githubLogin = typeof req.query.githubLogin === 'string' ? req.query.githubLogin : '';
    if (!githubLogin) {
      return res.status(400).json({ error: 'githubLogin is required', code: 'VALIDATION_ERROR' });
    }
    const number = req.query.number !== undefined ? Number(req.query.number) : undefined;
    if (number !== undefined && !Number.isInteger(number)) {
      return res.status(400).json({ error: 'number must be an integer', code: 'VALIDATION_ERROR' });
    }
    const verified = store.isVerified({
      githubLogin,
      number,
      kind: typeof req.query.kind === 'string' ? req.query.kind : undefined,
      repo: typeof req.query.repo === 'string' ? req.query.repo : undefined,
    });
    return res.json({ githubLogin, verified });
  });

  router.get('/', (req, res) => {
    const data = store.list({
      githubLogin: typeof req.query.githubLogin === 'string' ? req.query.githubLogin : undefined,
      repo: typeof req.query.repo === 'string' ? req.query.repo : undefined,
      limit: Number.parseInt(String(req.query.limit ?? ''), 10) || 50,
    });
    return res.json({ data, total: data.length });
  });

  return router;
}

/**
 * Batch campaign routes — POST/PUT/DELETE /api/v1/campaigns/batch
 *
 * Each batch counts as N requests against the rate limiter (N = array length).
 * Partial-success mode is default; pass ?strict=true for all-or-nothing.
 */

import { campaignCreateSchema, campaignUpdateSchema, formatZodErrors } from '../schemas.js';

/**
 * Build an express Router with batch endpoints.
 *
 * @param {{
 *   campaignRepository: import('../dal/sqliteCampaignRepository.js').CampaignRepository,
 *   rateLimiter: import('express').RequestHandler,
 *   requireApiKey: import('express').RequestHandler,
 *   recordAuditEntry: Function,
 *   webhookService: import('../services/webhookService.js').WebhookService,
 *   WEBHOOK_EVENTS: Record<string, string>,
 *   shortCache: Map<string, unknown>,
 *   log: import('pino').Logger,
 * }} deps
 * @returns {import('express').Router}
 */
export function createBatchRouter({
  campaignRepository,
  rateLimiter,
  requireApiKey,
  recordAuditEntry,
  webhookService,
  WEBHOOK_EVENTS,
  shortCache,
  log,
}) {
  // Lazy import to avoid circular dep at module-load time
  const { Router } = await import('express').then((m) => m);

  /** @type {import('express').Router} */
  // We use a factory fn that returns a plain object of handlers; the caller
  // registers them onto the existing Express app (see registerBatchRoutes).
  return { batchCreate, batchUpdate, batchDelete };

  // ─── helpers ────────────────────────────────────────────────────────────────

  /** Consume N rate-limit tokens for a batch of N items. */
  function batchRateLimiter(count) {
    return (req, res, next) => {
      let remaining = count;
      function tick() {
        if (remaining <= 1) return rateLimiter(req, res, next);
        remaining -= 1;
        // Call the limiter as a middleware but intercept the "send" to chain.
        const fakeRes = {
          ...res,
          status: () => fakeRes,
          json: () => { res.status(429).json({ error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' }); },
          setHeader: () => {},
          getHeader: () => undefined,
        };
        rateLimiter(req, fakeRes, tick);
      }
      tick();
    };
  }

  // ─── POST /campaigns/batch ───────────────────────────────────────────────────

  /** @type {import('express').RequestHandler} */
  function batchCreate(req, res) {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Body must be a non-empty array', code: 'VALIDATION_ERROR' });
    }
    if (items.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 items per batch', code: 'BATCH_TOO_LARGE' });
    }

    const strict = req.query.strict === 'true';
    const created = [];
    const errors = [];

    // Validate all first in strict mode so we fail fast before touching the DB
    if (strict) {
      for (let i = 0; i < items.length; i++) {
        const result = campaignCreateSchema.safeParse(items[i]);
        if (!result.success) {
          return res.status(400).json({
            error: 'Validation failed (strict mode)',
            code: 'VALIDATION_ERROR',
            index: i,
            details: formatZodErrors(result.error),
          });
        }
      }
    }

    // Wrap in a transaction via the repository's underlying db handle
    const run = campaignRepository._db
      ? campaignRepository._db.transaction
      : (fn) => fn; // fallback for non-sqlite impls

    try {
      run(() => {
        for (let i = 0; i < items.length; i++) {
          const result = campaignCreateSchema.safeParse(items[i]);
          if (!result.success) {
            if (strict) throw Object.assign(new Error('strict'), { index: i, details: formatZodErrors(result.error) });
            errors.push({ index: i, error: 'Validation failed', details: formatZodErrors(result.error) });
            continue;
          }
          try {
            const campaign = campaignRepository.create({
              ...result.data,
              active: result.data.active ?? true,
              featured: result.data.featured ?? false,
              hidden: result.data.hidden ?? false,
              description: result.data.description ?? '',
              rewardPerAction: result.data.rewardPerAction ?? 0,
              referralBonusPoints: result.data.referralBonusPoints ?? 0,
              startDate: result.data.startDate ?? null,
              endDate: result.data.endDate ?? null,
              contractId: result.data.contractId ?? null,
              imageUrl: result.data.imageUrl ?? null,
              tags: result.data.tags ?? [],
              category: result.data.category ?? null,
            });
            created.push(campaign);
          } catch (err) {
            if (strict) throw err;
            const code = err.message?.includes('UNIQUE') ? 'SLUG_CONFLICT' : 'CREATE_FAILED';
            errors.push({ index: i, error: err.message, code });
          }
        }
      })();
    } catch (err) {
      if (err.message === 'strict') {
        return res.status(400).json({ error: 'Validation failed (strict mode)', code: 'VALIDATION_ERROR', index: err.index, details: err.details });
      }
      throw err;
    }

    for (const campaign of created) {
      recordAuditEntry(req, { action: 'create', entity: 'campaign', entityId: campaign.id, diff: { after: campaign } });
      webhookService.dispatchEvent({ type: WEBHOOK_EVENTS.CAMPAIGN_CREATED, campaignId: campaign.id, data: campaign, timestamp: new Date().toISOString() })
        .catch((e) => log.warn({ err: e, campaignId: campaign.id }, 'batch: webhook dispatch failed'));
    }
    shortCache.clear();

    return res.status(207).json({ created, errors });
  }

  // ─── PUT /campaigns/batch ────────────────────────────────────────────────────

  /** @type {import('express').RequestHandler} */
  function batchUpdate(req, res) {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Body must be a non-empty array', code: 'VALIDATION_ERROR' });
    }
    if (items.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 items per batch', code: 'BATCH_TOO_LARGE' });
    }

    const strict = req.query.strict === 'true';
    const updated = [];
    const errors = [];

    if (strict) {
      for (let i = 0; i < items.length; i++) {
        if (!items[i]?.id) {
          return res.status(400).json({ error: `Item at index ${i} missing required field "id"`, code: 'VALIDATION_ERROR' });
        }
        const { id, ...fields } = items[i];
        const result = campaignUpdateSchema.safeParse(fields);
        if (!result.success) {
          return res.status(400).json({ error: 'Validation failed (strict mode)', code: 'VALIDATION_ERROR', index: i, details: formatZodErrors(result.error) });
        }
      }
    }

    const run = campaignRepository._db
      ? campaignRepository._db.transaction
      : (fn) => fn;

    try {
      run(() => {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item?.id) {
            if (strict) throw Object.assign(new Error('strict'), { index: i, details: ['Missing "id"'] });
            errors.push({ index: i, error: 'Missing "id"', code: 'VALIDATION_ERROR' });
            continue;
          }
          const { id, ...fields } = item;
          const result = campaignUpdateSchema.safeParse(fields);
          if (!result.success) {
            if (strict) throw Object.assign(new Error('strict'), { index: i, details: formatZodErrors(result.error) });
            errors.push({ index: i, id, error: 'Validation failed', details: formatZodErrors(result.error) });
            continue;
          }
          const before = campaignRepository.getById(id);
          if (!before) {
            if (strict) throw Object.assign(new Error('strict'), { index: i, details: [`Campaign ${id} not found`] });
            errors.push({ index: i, id, error: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
            continue;
          }
          try {
            const campaign = campaignRepository.update(id, result.data);
            updated.push(campaign);
            recordAuditEntry(req, { action: 'update', entity: 'campaign', entityId: id, diff: { before, after: campaign, changes: Object.keys(result.data) } });
          } catch (err) {
            if (strict) throw err;
            errors.push({ index: i, id, error: err.message, code: 'UPDATE_FAILED' });
          }
        }
      })();
    } catch (err) {
      if (err.message === 'strict') {
        return res.status(400).json({ error: 'Operation failed (strict mode)', code: 'STRICT_MODE_ERROR', index: err.index, details: err.details });
      }
      throw err;
    }

    for (const campaign of updated) {
      webhookService.dispatchEvent({ type: WEBHOOK_EVENTS.CAMPAIGN_UPDATED, campaignId: campaign.id, data: campaign, timestamp: new Date().toISOString() })
        .catch((e) => log.warn({ err: e, campaignId: campaign.id }, 'batch: update webhook failed'));
    }
    shortCache.clear();

    return res.status(207).json({ updated, errors });
  }

  // ─── DELETE /campaigns/batch ─────────────────────────────────────────────────

  /** @type {import('express').RequestHandler} */
  function batchDelete(req, res) {
    const { ids } = req.body ?? {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Body must contain a non-empty "ids" array', code: 'VALIDATION_ERROR' });
    }
    if (ids.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 ids per batch', code: 'BATCH_TOO_LARGE' });
    }

    const strict = req.query.strict === 'true';
    const deleted = [];
    const errors = [];

    const run = campaignRepository._db
      ? campaignRepository._db.transaction
      : (fn) => fn;

    try {
      run(() => {
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          const before = campaignRepository.getById(id);
          if (!before) {
            if (strict) throw Object.assign(new Error('strict'), { index: i, details: [`Campaign ${id} not found`] });
            errors.push({ index: i, id, error: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
            continue;
          }
          const ok = campaignRepository.delete(id);
          if (ok) {
            deleted.push(id);
            recordAuditEntry(req, { action: 'delete', entity: 'campaign', entityId: id, diff: { before } });
            webhookService.dispatchEvent({ type: WEBHOOK_EVENTS.CAMPAIGN_DELETED, campaignId: id, data: before, timestamp: new Date().toISOString() })
              .catch((e) => log.warn({ err: e, campaignId: id }, 'batch: delete webhook failed'));
          } else {
            if (strict) throw Object.assign(new Error('strict'), { index: i, details: [`Delete failed for campaign ${id}`] });
            errors.push({ index: i, id, error: 'Delete failed', code: 'DELETE_FAILED' });
          }
        }
      })();
    } catch (err) {
      if (err.message === 'strict') {
        return res.status(400).json({ error: 'Operation failed (strict mode)', code: 'STRICT_MODE_ERROR', index: err.index, details: err.details });
      }
      throw err;
    }

    shortCache.clear();
    return res.status(207).json({ deleted, errors });
  }
}

/**
 * Register batch routes on an existing Express app.
 *
 * Call this from `registerApiRoutes` in `index.js`:
 *   registerBatchRoutes(app, prefix, deps);
 *
 * @param {import('express').Application} app
 * @param {string} prefix  e.g. '/api/v1'
 * @param {Parameters<typeof createBatchRouter>[0]} deps
 */
export function registerBatchRoutes(app, prefix, deps) {
  const { batchCreate, batchUpdate, batchDelete } = createBatchRouter(deps);

  /** Middleware that counts a batch as N rate-limit hits. */
  function batchCountingRateLimiter(req, res, next) {
    // Determine N before validating — use array length or ids length
    const body = req.body;
    const n = Array.isArray(body) ? body.length : Array.isArray(body?.ids) ? body.ids.length : 1;
    // Invoke the base rateLimiter n times sequentially; the first rejection wins.
    let i = 0;
    function step() {
      if (i++ >= n) return next();
      deps.rateLimiter(req, res, step);
    }
    step();
  }

  app.post(`${prefix}/campaigns/batch`, batchCountingRateLimiter, deps.requireApiKey, batchCreate);
  app.put(`${prefix}/campaigns/batch`, batchCountingRateLimiter, deps.requireApiKey, batchUpdate);
  app.delete(`${prefix}/campaigns/batch`, batchCountingRateLimiter, deps.requireApiKey, batchDelete);
}
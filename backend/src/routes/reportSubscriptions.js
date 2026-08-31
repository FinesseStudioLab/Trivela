// @ts-check
import { Router } from 'express';

const VALID_SCHEDULES = ['daily', 'weekly', 'monthly'];
const VALID_REPORT_TYPES = ['campaign-summary', 'analytics-digest', 'referral-digest'];

/**
 * User-facing API for managing scheduled report email subscriptions.
 *
 * Routes:
 *   GET    /api/v1/report-subscriptions          – list current user's subscriptions
 *   POST   /api/v1/report-subscriptions          – subscribe to a report
 *   PATCH  /api/v1/report-subscriptions/:id      – update schedule or report type
 *   DELETE /api/v1/report-subscriptions/:id      – unsubscribe (opt-out)
 *
 * @param {{
 *   dal: {
 *     reportSubscriptions: {
 *       listByUserId: (userId: string) => object[],
 *       create: (args: { userId: string, email: string, reportType: string, schedule: string }) => object,
 *       update: (args: { id: string, userId: string, schedule?: string, reportType?: string }) => object | null,
 *       delete: (args: { id: string, userId: string }) => boolean,
 *     },
 *     notificationPreferences: {
 *       getByUserId: (userId: string) => { email_enabled: 0 | 1 } | null
 *     }
 *   },
 *   requireAuth: import('express').RequestHandler | import('express').RequestHandler[],
 *   log?: Pick<Console, 'info' | 'warn' | 'error'>
 * }} deps
 */
export function createReportSubscriptionsRouter({ dal, requireAuth, log = console }) {
  const router = Router();
  const auth = Array.isArray(requireAuth) ? requireAuth : [requireAuth];

  // ── GET /api/v1/report-subscriptions ────────────────────────────────────────

  router.get('/report-subscriptions', ...auth, (req, res) => {
    // Auth middleware decorates the request at runtime; Express's own
    // type has no `user`.
    const userId = /** @type {any} */ (req).user?.id ?? req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    const subscriptions = dal.reportSubscriptions.listByUserId(String(userId));
    return res.json({ subscriptions });
  });

  // ── POST /api/v1/report-subscriptions ───────────────────────────────────────

  router.post('/report-subscriptions', ...auth, (req, res) => {
    // Auth middleware decorates the request at runtime; Express's own
    // type has no `user`.
    const userId = /** @type {any} */ (req).user?.id ?? req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    // Respect the global email opt-out preference
    const prefs = dal.notificationPreferences.getByUserId(String(userId));
    if (prefs && prefs.email_enabled === 0) {
      return res.status(403).json({
        error:
          'Email notifications are disabled for your account. Enable them in notification preferences first.',
        code: 'EMAIL_OPTED_OUT',
      });
    }

    const { email, reportType = 'campaign-summary', schedule = 'weekly' } = req.body ?? {};

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res
        .status(400)
        .json({ error: 'Valid email address is required', code: 'INVALID_EMAIL' });
    }

    if (!VALID_REPORT_TYPES.includes(reportType)) {
      return res.status(400).json({
        error: `reportType must be one of: ${VALID_REPORT_TYPES.join(', ')}`,
        code: 'INVALID_REPORT_TYPE',
      });
    }

    if (!VALID_SCHEDULES.includes(schedule)) {
      return res.status(400).json({
        error: `schedule must be one of: ${VALID_SCHEDULES.join(', ')}`,
        code: 'INVALID_SCHEDULE',
      });
    }

    try {
      const subscription = dal.reportSubscriptions.create({
        userId: String(userId),
        email,
        reportType,
        schedule,
      });
      log.info?.(
        `reportSubscriptions:created userId=${userId} schedule=${schedule} type=${reportType}`,
      );
      return res.status(201).json({ subscription });
    } catch (err) {
      log.error?.('reportSubscriptions:create_failed', err);
      return res
        .status(500)
        .json({ error: 'Failed to create subscription', code: 'INTERNAL_ERROR' });
    }
  });

  // ── PATCH /api/v1/report-subscriptions/:id ──────────────────────────────────

  router.patch('/report-subscriptions/:id', ...auth, (req, res) => {
    // Auth middleware decorates the request at runtime; Express's own
    // type has no `user`.
    const userId = /** @type {any} */ (req).user?.id ?? req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const { schedule, reportType } = req.body ?? {};

    if (schedule && !VALID_SCHEDULES.includes(schedule)) {
      return res.status(400).json({
        error: `schedule must be one of: ${VALID_SCHEDULES.join(', ')}`,
        code: 'INVALID_SCHEDULE',
      });
    }

    if (reportType && !VALID_REPORT_TYPES.includes(reportType)) {
      return res.status(400).json({
        error: `reportType must be one of: ${VALID_REPORT_TYPES.join(', ')}`,
        code: 'INVALID_REPORT_TYPE',
      });
    }

    const updated = dal.reportSubscriptions.update({
      id: req.params.id,
      userId: String(userId),
      schedule,
      reportType,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Subscription not found', code: 'NOT_FOUND' });
    }

    return res.json({ subscription: updated });
  });

  // ── DELETE /api/v1/report-subscriptions/:id ─────────────────────────────────
  // Explicit opt-out. Removing a subscription stops future emails for that report.

  router.delete('/report-subscriptions/:id', ...auth, (req, res) => {
    // Auth middleware decorates the request at runtime; Express's own
    // type has no `user`.
    const userId = /** @type {any} */ (req).user?.id ?? req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const deleted = dal.reportSubscriptions.delete({
      id: req.params.id,
      userId: String(userId),
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Subscription not found', code: 'NOT_FOUND' });
    }

    log.info?.(`reportSubscriptions:deleted id=${req.params.id} userId=${userId}`);
    return res.status(204).send();
  });

  return router;
}

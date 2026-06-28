// @ts-check
import { Router } from 'express';
import { requirePermission } from '../middleware/rbac.js';

/**
 * Organization-scoped audit log API routes
 *
 * Route summary:
 *   GET    /orgs/:orgId/audit                    – get org audit logs    (audit:read)
 *   GET    /orgs/:orgId/audit/export/csv         – export audit as CSV   (audit:read)
 *   GET    /orgs/:orgId/audit/export/json        – export audit as JSON  (audit:read)
 *   GET    /orgs/:orgId/audit/stats               – get audit statistics  (audit:read)
 *   GET    /orgs/:orgId/activity-feed             – get activity feed     (audit:read)
 */

/**
 * @param {{
 *   auditLogService: ReturnType<import('../services/auditLogService.js').createAuditLogService>,
 *   requireApiKey: import('express').RequestHandler[],
 * }} services
 */
export function createAuditRouter({ auditLogService, requireApiKey }) {
  const router = Router();

  // ── Get org audit logs ───────────────────────────────────────────────────

  router.get('/orgs/:orgId/audit', requireApiKey, requirePermission('audit:read'), (req, res) => {
    // Security: users can only access audit logs for their own org
    if (req.auth?.orgId && req.auth.orgId !== req.params.orgId) {
      return res.status(403).json({ error: 'Forbidden', code: 'WRONG_ORG' });
    }

    const { orgId } = req.params;
    const { actor, action, entity, entityId, startDate, endDate, page, pageSize } = req.query;

    try {
      const result = auditLogService.getOrgAuditLogs(orgId, {
        actor,
        action,
        entity,
        entityId,
        startDate,
        endDate,
        page: parseInt(/** @type {string} */ (page) || '1', 10),
        pageSize: parseInt(/** @type {string} */ (pageSize) || '50', 10),
      });

      return res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      return res.status(500).json({
        error: 'Internal server error',
        code: 'AUDIT_FETCH_ERROR',
      });
    }
  });

  // ── Export audit logs as CSV ─────────────────────────────────────────────

  router.get(
    '/orgs/:orgId/audit/export/csv',
    requireApiKey,
    requirePermission('audit:read'),
    (req, res) => {
      // Security: users can only export audit logs for their own org
      if (req.auth?.orgId && req.auth.orgId !== req.params.orgId) {
        return res.status(403).json({ error: 'Forbidden', code: 'WRONG_ORG' });
      }

      const { orgId } = req.params;
      const { actor, action, entity, entityId, startDate, endDate } = req.query;

      try {
        const exportResult = auditLogService.exportToCsv(orgId, {
          actor,
          action,
          entity,
          entityId,
          startDate,
          endDate,
        });

        res.setHeader('Content-Type', exportResult.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);

        return res.send(exportResult.content);
      } catch (error) {
        console.error('Error exporting audit logs as CSV:', error);
        return res.status(500).json({
          error: 'Internal server error',
          code: 'AUDIT_EXPORT_ERROR',
        });
      }
    },
  );

  // ── Export audit logs as JSON ────────────────────────────────────────────

  router.get(
    '/orgs/:orgId/audit/export/json',
    requireApiKey,
    requirePermission('audit:read'),
    (req, res) => {
      // Security: users can only export audit logs for their own org
      if (req.auth?.orgId && req.auth.orgId !== req.params.orgId) {
        return res.status(403).json({ error: 'Forbidden', code: 'WRONG_ORG' });
      }

      const { orgId } = req.params;
      const { actor, action, entity, entityId, startDate, endDate } = req.query;

      try {
        const exportResult = auditLogService.exportToJson(orgId, {
          actor,
          action,
          entity,
          entityId,
          startDate,
          endDate,
        });

        res.setHeader('Content-Type', exportResult.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);

        return res.send(exportResult.content);
      } catch (error) {
        console.error('Error exporting audit logs as JSON:', error);
        return res.status(500).json({
          error: 'Internal server error',
          code: 'AUDIT_EXPORT_ERROR',
        });
      }
    },
  );

  // ── Get audit statistics ─────────────────────────────────────────────────

  router.get(
    '/orgs/:orgId/audit/stats',
    requireApiKey,
    requirePermission('audit:read'),
    (req, res) => {
      // Security: users can only access audit stats for their own org
      if (req.auth?.orgId && req.auth.orgId !== req.params.orgId) {
        return res.status(403).json({ error: 'Forbidden', code: 'WRONG_ORG' });
      }

      const { orgId } = req.params;
      const { startDate, endDate } = req.query;

      try {
        const stats = auditLogService.getOrgAuditStats(orgId, {
          startDate,
          endDate,
        });

        return res.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        console.error('Error fetching audit stats:', error);
        return res.status(500).json({
          error: 'Internal server error',
          code: 'AUDIT_STATS_ERROR',
        });
      }
    },
  );

  // ── Get activity feed ────────────────────────────────────────────────────

  router.get(
    '/orgs/:orgId/activity-feed',
    requireApiKey,
    requirePermission('audit:read'),
    (req, res) => {
      // Security: users can only access activity feed for their own org
      if (req.auth?.orgId && req.auth.orgId !== req.params.orgId) {
        return res.status(403).json({ error: 'Forbidden', code: 'WRONG_ORG' });
      }

      const { orgId } = req.params;
      const { limit, since } = req.query;

      try {
        const activities = auditLogService.getActivityFeed(orgId, {
          limit: parseInt(/** @type {string} */ (limit) || '20', 10),
          since: /** @type {string | undefined} */ (since),
        });

        return res.json({
          success: true,
          data: activities,
        });
      } catch (error) {
        console.error('Error fetching activity feed:', error);
        return res.status(500).json({
          error: 'Internal server error',
          code: 'ACTIVITY_FEED_ERROR',
        });
      }
    },
  );

  return router;
}

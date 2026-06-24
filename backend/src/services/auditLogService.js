// @ts-check

/**
 * Service for handling organization-scoped audit logs and activity feeds
 */
export function createAuditLogService({ auditLogRepository, orgMemberRepository }) {
  /**
   * Create an audit log entry with organization context
   * @param {{
   *   actor: string,
   *   action: string,
   *   entity: string,
   *   entityId?: string | null,
   *   diff?: object | null,
   *   orgId?: string | null,
   *   timestamp?: string | null
   * }} params
   */
  function logAction(params) {
    return auditLogRepository.create(params);
  }

  /**
   * Get org-scoped audit logs with filtering and pagination
   * @param {string} orgId - Organization ID
   * @param {{
   *   actor?: string,
   *   action?: string,
   *   entity?: string,
   *   entityId?: string,
   *   startDate?: string,
   *   endDate?: string,
   *   page?: number,
   *   pageSize?: number
   * }} filters
   */
  function getOrgAuditLogs(orgId, filters = {}) {
    const { page = 1, pageSize = 50, ...otherFilters } = filters;
    const limit = Math.min(pageSize, 100); // Cap at 100 per page
    const offset = (page - 1) * limit;

    const logs = auditLogRepository.list({
      orgId,
      ...otherFilters,
      limit,
      offset,
    });

    const totalCount = auditLogRepository.count({
      orgId,
      ...otherFilters,
    });

    const totalPages = Math.ceil(totalCount / limit);

    return {
      data: logs,
      pagination: {
        page,
        pageSize: limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Get activity feed for organization (recent actions with enhanced formatting)
   * @param {string} orgId - Organization ID
   * @param {{
   *   limit?: number,
   *   since?: string
   * }} options
   */
  function getActivityFeed(orgId, options = {}) {
    const { limit = 20, since } = options;

    const filters = {
      orgId,
      limit: Math.min(limit, 50), // Cap at 50 for activity feed
      ...(since && { startDate: since }),
    };

    const logs = auditLogRepository.list(filters);

    // Enhance logs with human-readable descriptions
    const activities = logs.map((log) => ({
      ...log,
      description: generateActivityDescription(log),
      timestamp: log.timestamp,
    }));

    return activities;
  }

  /**
   * Export org audit logs as CSV
   * @param {string} orgId - Organization ID
   * @param {object} filters - Filter options
   */
  function exportToCsv(orgId, filters = {}) {
    // Get all matching records (remove pagination for export)
    const { page, pageSize, ...exportFilters } = filters;
    const logs = auditLogRepository.list({
      orgId,
      ...exportFilters,
      limit: 10000, // Set reasonable limit for export
      offset: 0,
    });

    // CSV headers
    const headers = ['ID', 'Actor', 'Action', 'Entity', 'Entity ID', 'Timestamp', 'Changes'];

    // Convert logs to CSV rows
    const rows = logs.map((log) => [
      log.id,
      log.actor,
      log.action,
      log.entity,
      log.entityId || '',
      log.timestamp,
      log.diff ? JSON.stringify(log.diff) : '',
    ]);

    // Combine headers and rows
    const csvContent = [headers, ...rows]
      .map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return {
      content: csvContent,
      filename: `audit-log-${orgId}-${new Date().toISOString().split('T')[0]}.csv`,
      mimeType: 'text/csv',
    };
  }

  /**
   * Export org audit logs as JSON
   * @param {string} orgId - Organization ID
   * @param {object} filters - Filter options
   */
  function exportToJson(orgId, filters = {}) {
    // Get all matching records (remove pagination for export)
    const { page, pageSize, ...exportFilters } = filters;
    const logs = auditLogRepository.list({
      orgId,
      ...exportFilters,
      limit: 10000, // Set reasonable limit for export
      offset: 0,
    });

    const exportData = {
      orgId,
      exportedAt: new Date().toISOString(),
      filters: exportFilters,
      totalRecords: logs.length,
      auditLogs: logs,
    };

    return {
      content: JSON.stringify(exportData, null, 2),
      filename: `audit-log-${orgId}-${new Date().toISOString().split('T')[0]}.json`,
      mimeType: 'application/json',
    };
  }

  /**
   * Get audit log statistics for an organization
   * @param {string} orgId - Organization ID
   * @param {{
   *   startDate?: string,
   *   endDate?: string
   * }} options
   */
  function getOrgAuditStats(orgId, options = {}) {
    const { startDate, endDate } = options;
    const filters = { orgId, startDate, endDate };

    const totalActions = auditLogRepository.count(filters);

    // Get action breakdown
    const allLogs = auditLogRepository.list({ ...filters, limit: 10000, offset: 0 });

    const actionStats = allLogs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {});

    const entityStats = allLogs.reduce((acc, log) => {
      acc[log.entity] = (acc[log.entity] || 0) + 1;
      return acc;
    }, {});

    const actorStats = allLogs.reduce((acc, log) => {
      acc[log.actor] = (acc[log.actor] || 0) + 1;
      return acc;
    }, {});

    return {
      totalActions,
      actionBreakdown: actionStats,
      entityBreakdown: entityStats,
      topActors: Object.entries(actorStats)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([actor, count]) => ({ actor, count })),
    };
  }

  return {
    logAction,
    getOrgAuditLogs,
    getActivityFeed,
    exportToCsv,
    exportToJson,
    getOrgAuditStats,
  };
}

/**
 * Generate human-readable activity descriptions
 * @param {object} log - Audit log entry
 * @returns {string} - Human-readable description
 */
function generateActivityDescription(log) {
  const { actor, action, entity, entityId, diff } = log;

  const entityName = entityId ? `${entity} "${entityId}"` : entity;

  switch (action) {
    case 'create':
      return `${actor} created ${entityName}`;
    case 'update':
      if (diff && diff.before && diff.after) {
        const changedFields = Object.keys(diff.after).join(', ');
        return `${actor} updated ${entityName} (changed: ${changedFields})`;
      }
      return `${actor} updated ${entityName}`;
    case 'delete':
      return `${actor} deleted ${entityName}`;
    case 'activate':
      return `${actor} activated ${entityName}`;
    case 'deactivate':
      return `${actor} deactivated ${entityName}`;
    case 'archive':
      return `${actor} archived ${entityName}`;
    case 'restore':
      return `${actor} restored ${entityName}`;
    case 'assign':
      return `${actor} assigned ${entityName}`;
    case 'unassign':
      return `${actor} unassigned ${entityName}`;
    case 'approve':
      return `${actor} approved ${entityName}`;
    case 'reject':
      return `${actor} rejected ${entityName}`;
    case 'publish':
      return `${actor} published ${entityName}`;
    case 'unpublish':
      return `${actor} unpublished ${entityName}`;
    default:
      return `${actor} performed "${action}" on ${entityName}`;
  }
}

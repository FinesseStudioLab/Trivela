const REQUIRED_METHODS = ['list', 'create', 'count', 'verify'];

export function assertAuditLogRepository(repository) {
  if (!repository || typeof repository !== 'object') {
    throw new Error('auditLogRepository is required');
  }

  for (const method of REQUIRED_METHODS) {
    if (typeof repository[method] !== 'function') {
      throw new Error(`auditLogRepository must implement ${method}()`);
    }
  }

  return repository;
}

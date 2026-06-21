const REQUIRED_METHODS = ['list', 'getById', 'getBySlug', 'create', 'update', 'delete'];

export function assertCampaignRepository(repository) {
  if (!repository || typeof repository !== 'object') {
    throw new Error('campaignRepository is required');
  }

  for (const method of REQUIRED_METHODS) {
    if (typeof repository[method] !== 'function') {
      throw new Error(`campaignRepository must implement ${method}()`);
    }
  }

  return repository;
}

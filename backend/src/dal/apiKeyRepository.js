const REQUIRED_METHODS = ['create', 'list', 'getById', 'revoke', 'validate', 'rotate'];

export function assertApiKeyRepository(repository) {
  if (!repository || typeof repository !== 'object') {
    throw new Error('apiKeyRepository is required');
  }

  for (const method of REQUIRED_METHODS) {
    if (typeof repository[method] !== 'function') {
      throw new Error(`apiKeyRepository must implement ${method}()`);
    }
  }

  return repository;
}

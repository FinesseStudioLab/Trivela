/**
 * Duck-typed campaign repository. Concrete implementations (SQLite, in-memory)
 * provide these methods; consumers validate via {@link assertCampaignRepository}.
 *
 * @typedef {object} CampaignRepository
 * @property {(...args: any[]) => any} list
 * @property {(id: string) => any} getById
 * @property {(slug: string) => any} getBySlug
 * @property {(...args: any[]) => any} create
 * @property {(...args: any[]) => any} update
 * @property {(...args: any[]) => any} delete
 */

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

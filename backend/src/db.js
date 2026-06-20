/**
 * Backward-compatible wrapper around the repository-based DAL.
 *
 * New code should prefer `backend/src/dal/*`.
 */

import { createSqliteCampaignRepository } from './dal/sqliteCampaignRepository.js';

export function createDb(dbPath = ':memory:', seed = []) {
  const repository = createSqliteCampaignRepository({ dbPath, seed });

  return {
    getAll: repository.list,
    getById: repository.getById,
    create: repository.create,
    update: repository.update,
    delete: repository.delete,
  };
}

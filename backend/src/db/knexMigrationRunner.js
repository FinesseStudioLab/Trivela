/**
 * Knex-based Migration Runner with Rollback Support
 * Provides advanced database schema migration with versioning and rollback
 */

import knex from 'knex';
import knexConfig from './knexConfig.js';
import { log } from '../middleware/logger.js';

let instance = null;

export async function initKnex() {
  if (instance) return instance;

  instance = knex(knexConfig);
  log.info({ client: knexConfig.client }, 'knex:initialized');
  return instance;
}

export async function runMigrations(options = {}) {
  const db = await initKnex();

  try {
    const [batchNo, migrations] = await db.migrate.latest(options);

    log.info({
      batch: batchNo,
      count: migrations.length,
      migrations,
    }, 'migrations:completed');

    return { success: true, batch: batchNo, migrations };
  } catch (error) {
    log.error({ error: error.message }, 'migrations:failed');
    throw error;
  }
}

export async function rollbackMigrations(options = {}) {
  const db = await initKnex();

  try {
    const [batchNo, migrations] = await db.migrate.rollback(options);

    log.info({
      batch: batchNo,
      count: migrations.length,
      migrations,
    }, 'rollback:completed');

    return { success: true, batch: batchNo, migrations };
  } catch (error) {
    log.error({ error: error.message }, 'rollback:failed');
    throw error;
  }
}

export async function getMigrationStatus() {
  const db = await initKnex();

  try {
    const completed = await db.migrate.status();

    return {
      completed,
      status: 'ok',
    };
  } catch (error) {
    log.warn({ error: error.message }, 'migration:status:check:failed');
    return { completed: 0, status: 'error', error: error.message };
  }
}

export async function closeKnex() {
  if (instance) {
    await instance.destroy();
    instance = null;
    log.info({}, 'knex:closed');
  }
}

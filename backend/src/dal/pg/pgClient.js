// @ts-check
import pg from 'pg';

const { Pool } = pg;

/**
 * Factory for a node-postgres connection pool keyed on the connection string.
 * Reuses the same pool across DAL constructions to avoid socket fan-out during
 * tests and request handlers.
 *
 * @param {string} connectionString
 * @returns {pg.Pool}
 */
export function createPool(connectionString) {
  if (!connectionString) {
    throw new Error('createPool requires a DATABASE_URL');
  }
  return new Pool({
    connectionString,
    application_name: 'trivela-backend',
    max: Number(process.env.PG_POOL_MAX ?? 10),
  });
}

/**
 * Returns true when the URL is the postgres flavour we route through `pg/`.
 *
 * @param {string | undefined} url
 */
export function isPostgresUrl(url) {
  if (!url) return false;
  return /^postgres(ql)?:\/\//.test(url);
}

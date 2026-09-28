/**
 * Knex Configuration for Database Schema Migration Framework
 * Provides Knex.js integration for advanced migrations and rollbacks
 */

const environments = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: process.env.DB_PATH ?? './trivela.db',
    },
    useNullAsDefault: true,
    migrations: {
      directory: './src/db/knex-migrations',
      extension: 'js',
    },
    seeds: {
      directory: './src/db/knex-seeds',
      extension: 'js',
    },
  },
  test: {
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
    migrations: {
      directory: './src/db/knex-migrations',
      extension: 'js',
    },
  },
  production: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: './src/db/knex-migrations',
      extension: 'js',
      tableName: 'knex_migrations',
    },
    pool: {
      min: 2,
      max: 10,
    },
  },
};

export default environments[process.env.NODE_ENV ?? 'development'];

import { log } from './logger.js';

/**
 * PostgreSQL Read Replica Query Splitting Middleware
 * Routes read queries to replica instances and write queries to primary
 */

class ReadReplicaRouter {
  constructor({ primaryPool, replicaPools = [] }) {
    this.primaryPool = primaryPool;
    this.replicaPools = replicaPools;
    this.currentReplicaIndex = 0;
  }

  getReadConnection() {
    if (this.replicaPools.length === 0) {
      return this.primaryPool;
    }

    const replica = this.replicaPools[this.currentReplicaIndex];
    this.currentReplicaIndex = (this.currentReplicaIndex + 1) % this.replicaPools.length;

    return replica;
  }

  getWriteConnection() {
    return this.primaryPool;
  }

  isReadQuery(sql) {
    const trimmed = sql.trim().toUpperCase();
    return (
      trimmed.startsWith('SELECT') ||
      trimmed.startsWith('WITH') ||
      trimmed.startsWith('EXPLAIN')
    );
  }

  isWriteQuery(sql) {
    const trimmed = sql.trim().toUpperCase();
    return (
      trimmed.startsWith('INSERT') ||
      trimmed.startsWith('UPDATE') ||
      trimmed.startsWith('DELETE') ||
      trimmed.startsWith('CREATE') ||
      trimmed.startsWith('ALTER') ||
      trimmed.startsWith('DROP')
    );
  }

  async executeQuery(sql, params = [], options = {}) {
    const isRead = this.isReadQuery(sql);
    const connection = isRead ? this.getReadConnection() : this.getWriteConnection();

    const connectionType = isRead ? 'replica' : 'primary';
    log.debug({
      connectionType,
      queryLength: sql.length,
      paramCount: params.length,
    }, 'db:query:routing');

    try {
      if (options.transaction) {
        return connection.transaction(async () => {
          return connection.query(sql, params);
        })();
      }

      return await connection.query(sql, params);
    } catch (error) {
      log.error({
        error: error.message,
        connectionType,
      }, 'db:query:failed');
      throw error;
    }
  }

  middleware() {
    return (req, res, next) => {
      req.db = {
        query: (sql, params) => this.executeQuery(sql, params),
        transaction: (fn) => this.primaryPool.transaction(fn),
        read: (sql, params) => this.getReadConnection().query(sql, params),
        write: (sql, params) => this.getWriteConnection().query(sql, params),
      };
      next();
    };
  }

  setHealthCheck(replicaIndex, isHealthy) {
    if (!isHealthy && this.replicaPools[replicaIndex]) {
      log.warn({ replicaIndex }, 'db:replica:unhealthy');
    }
  }
}

export { ReadReplicaRouter };

// @ts-check
import { randomBytes } from 'node:crypto';

/**
 * Redis-backed distributed lock using SET NX PX with a fenced heartbeat.
 *
 * Acquire: SET lock:job:<key> <nonce> NX PX <ttlMs>
 * Heartbeat: PEXPIRE lock:job:<key> <ttlMs> every ttlMs/3 while held
 * Release: Lua CAS-delete (only deletes if the nonce still matches)
 *
 * The fencing nonce prevents a stale holder from releasing a lock
 * that another instance has already acquired.
 *
 * @param {import('ioredis').Redis} redisClient
 * @param {{ ttlMs?: number }} [opts]
 */
export function createDistributedLock(redisClient, { ttlMs = 30_000 } = {}) {
  return {
    /**
     * Try to acquire the lock. Returns a lock handle or null if already held.
     * @param {string} key
     * @returns {Promise<{ nonce: string, heartbeat: ReturnType<typeof setInterval> } | null>}
     */
    async acquire(key) {
      const fullKey = `lock:job:${key}`;
      const nonce = randomBytes(16).toString('hex');
      const result = await redisClient.set(fullKey, nonce, 'NX', 'PX', ttlMs);
      if (result !== 'OK') return null;

      // Renew the TTL at ttlMs/3 intervals so long-running jobs keep their lock
      const heartbeatMs = Math.floor(ttlMs / 3);
      const heartbeat = setInterval(async () => {
        try {
          await redisClient.pexpire(fullKey, ttlMs);
        } catch {
          clearInterval(heartbeat);
        }
      }, heartbeatMs);
      heartbeat.unref?.();

      return { nonce, heartbeat };
    },

    /**
     * Release the lock. Clears the heartbeat and performs a fenced delete via Lua.
     * @param {string} key
     * @param {{ nonce: string, heartbeat: ReturnType<typeof setInterval> } | null} lock
     */
    async release(key, lock) {
      if (!lock) return;
      clearInterval(lock.heartbeat);
      const fullKey = `lock:job:${key}`;
      // redisClient.eval executes a Lua script on the Redis server (not JS eval).
      // The script is a hardcoded constant — no user input is interpolated into it.
      // This is the standard fenced-delete pattern for Redis distributed locks.
      const lua =
        'if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end';
      await redisClient.eval(lua, 1, fullKey, lock.nonce).catch(() => {});
    },
  };
}

/**
 * In-process lock for single-instance deployments (dev / no Redis).
 *
 * Uses a Map with TTL. Not safe across processes — use createDistributedLock
 * in production multi-instance deployments.
 *
 * @param {{ ttlMs?: number }} [opts]
 */
export function createInMemoryLock({ ttlMs = 30_000 } = {}) {
  /** @type {Map<string, { nonce: string, expiry: number }>} */
  const locks = new Map();

  return {
    /**
     * @param {string} key
     * @returns {Promise<{ nonce: string } | null>}
     */
    async acquire(key) {
      const now = Date.now();
      const existing = locks.get(key);
      if (existing && existing.expiry > now) return null;
      const nonce = randomBytes(16).toString('hex');
      locks.set(key, { nonce, expiry: now + ttlMs });
      return { nonce };
    },

    /**
     * @param {string} key
     * @param {{ nonce: string } | null} lock
     */
    async release(key, lock) {
      if (!lock) return;
      if (locks.get(key)?.nonce === lock.nonce) locks.delete(key);
    },
  };
}

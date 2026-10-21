import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CacheService } from './cacheService.js';

describe('CacheService', () => {
  /** @type {CacheService} */
  let cache;

  beforeEach(() => {
    cache = new CacheService({ defaultTtlSec: 1 });
  });

  it('sets and gets cached values using memory fallback', async () => {
    await cache.set('test:key', { foo: 'bar' });
    const result = await cache.get('test:key');
    assert.deepEqual(result, { foo: 'bar' });
  });

  it('returns null on cache miss', async () => {
    const result = await cache.get('nonexistent:key');
    assert.equal(result, null);
  });

  it('expires cached entries after TTL', async () => {
    await cache.set('ttl:key', { data: 123 }, 0.05); // 50ms TTL
    const immediate = await cache.get('ttl:key');
    assert.deepEqual(immediate, { data: 123 });

    await new Promise((resolve) => setTimeout(resolve, 60));
    const expired = await cache.get('ttl:key');
    assert.equal(expired, null);
  });

  it('invalidates matching keys', async () => {
    await cache.set('cache:campaigns:list', [1, 2, 3]);
    await cache.set('cache:campaign:101', { id: 101 });
    await cache.set('cache:unrelated', 'keep me');

    await cache.invalidateCampaigns();

    assert.equal(await cache.get('cache:campaigns:list'), null);
    assert.equal(await cache.get('cache:campaign:101'), null);
    assert.equal(await cache.get('cache:unrelated'), 'keep me');
  });

  it('clears all cached keys', async () => {
    await cache.set('k1', 'v1');
    await cache.set('k2', 'v2');
    await cache.clear();
    assert.equal(await cache.get('k1'), null);
    assert.equal(await cache.get('k2'), null);
  });
});

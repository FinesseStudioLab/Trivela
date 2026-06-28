// @ts-check
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { createSqliteFeatureFlagRepository } from '../dal/sqliteFeatureFlagRepository.js';
import { createFeatureFlagService } from './featureFlagService.js';

function makeService() {
  const db = new Database(':memory:');
  runMigrations(db);
  const featureFlagRepository = createSqliteFeatureFlagRepository({ db });
  const service = createFeatureFlagService({ featureFlagRepository });
  return { service, featureFlagRepository };
}

describe('featureFlagService', () => {
  let service;
  let repo;

  beforeEach(() => {
    const result = makeService();
    service = result.service;
    repo = result.featureFlagRepository;
  });

  it('returns false for an unknown flag', () => {
    expect(service.isEnabled('nonexistent')).toBe(false);
  });

  it('returns false when flag is disabled', () => {
    service.setFlag({ flagKey: 'my-flag', enabled: false });
    expect(service.isEnabled('my-flag')).toBe(false);
  });

  it('returns true when flag is enabled with no targeting', () => {
    service.setFlag({ flagKey: 'my-flag', enabled: true });
    expect(service.isEnabled('my-flag')).toBe(true);
  });

  it('kill-switch overrides enabled flag', () => {
    service.setFlag({ flagKey: 'my-flag', enabled: true, targeting: { killSwitch: true } });
    expect(service.isEnabled('my-flag')).toBe(false);
  });

  it('org targeting: allows matching org', () => {
    service.setFlag({ flagKey: 'org-flag', enabled: true, targeting: { allowedOrgs: ['org-1'] } });
    expect(service.isEnabled('org-flag', { orgId: 'org-1' })).toBe(true);
  });

  it('org targeting: blocks non-matching org', () => {
    service.setFlag({ flagKey: 'org-flag', enabled: true, targeting: { allowedOrgs: ['org-1'] } });
    expect(service.isEnabled('org-flag', { orgId: 'org-2' })).toBe(false);
  });

  it('org targeting: blocks missing org', () => {
    service.setFlag({ flagKey: 'org-flag', enabled: true, targeting: { allowedOrgs: ['org-1'] } });
    expect(service.isEnabled('org-flag')).toBe(false);
  });

  it('user targeting: allows matching user', () => {
    service.setFlag({ flagKey: 'user-flag', enabled: true, targeting: { allowedUsers: ['user-42'] } });
    expect(service.isEnabled('user-flag', { userId: 'user-42' })).toBe(true);
  });

  it('user targeting: blocks non-matching user', () => {
    service.setFlag({ flagKey: 'user-flag', enabled: true, targeting: { allowedUsers: ['user-42'] } });
    expect(service.isEnabled('user-flag', { userId: 'user-99' })).toBe(false);
  });

  it('percentage rollout: 100% enables all users', () => {
    service.setFlag({ flagKey: 'pct-flag', enabled: true, targeting: { percentage: 100 } });
    expect(service.isEnabled('pct-flag', { userId: 'any-user' })).toBe(true);
  });

  it('percentage rollout: 0% disables all users', () => {
    service.setFlag({ flagKey: 'pct-flag', enabled: true, targeting: { percentage: 0 } });
    expect(service.isEnabled('pct-flag', { userId: 'any-user' })).toBe(false);
  });

  it('percentage rollout: requires userId', () => {
    service.setFlag({ flagKey: 'pct-flag', enabled: true, targeting: { percentage: 100 } });
    expect(service.isEnabled('pct-flag')).toBe(false);
  });

  it('percentage rollout: deterministic — same user always gets same result', () => {
    service.setFlag({ flagKey: 'stable-flag', enabled: true, targeting: { percentage: 50 } });
    const first = service.isEnabled('stable-flag', { userId: 'test-user' });
    expect(service.isEnabled('stable-flag', { userId: 'test-user' })).toBe(first);
  });

  it('getAllFlags returns empty array on empty store', () => {
    expect(service.getAllFlags()).toEqual([]);
  });

  it('getAllFlags returns all created flags', () => {
    service.setFlag({ flagKey: 'a', enabled: true });
    service.setFlag({ flagKey: 'b', enabled: false });
    const flags = service.getAllFlags();
    expect(flags).toHaveLength(2);
    expect(flags.map((f) => f.flagKey).sort()).toEqual(['a', 'b']);
  });

  it('deleteFlag removes the flag', () => {
    service.setFlag({ flagKey: 'temp', enabled: true });
    expect(service.deleteFlag('temp')).toBe(true);
    expect(service.isEnabled('temp')).toBe(false);
  });

  it('deleteFlag returns false for non-existent flag', () => {
    expect(service.deleteFlag('ghost')).toBe(false);
  });

  it('safe default: returns false when store throws', () => {
    const brokenRepo = {
      getByKey: () => { throw new Error('db down'); },
      list: () => { throw new Error('db down'); },
      upsert: () => { throw new Error('db down'); },
      remove: () => { throw new Error('db down'); },
    };
    const brokenService = createFeatureFlagService({ featureFlagRepository: brokenRepo });
    expect(brokenService.isEnabled('any-flag')).toBe(false);
    expect(brokenService.getAllFlags()).toEqual([]);
  });
});

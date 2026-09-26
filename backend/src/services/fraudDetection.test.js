import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import {
  RULE_PROXY_EXIT,
  RULE_SUBNET_CLUSTER,
  createFraudDetector,
  createProxyMatcher,
  getSubnetKey,
  normalizeIp,
} from './fraudDetection.js';

async function makeDb() {
  const db = new Database(':memory:');
  await runMigrations(db);
  return db;
}

test('getSubnetKey: IPv4 uses /24, IPv6 uses /64, mapped IPv4 is unwrapped', () => {
  assert.equal(getSubnetKey('203.0.113.77'), '203.0.113.0/24');
  assert.equal(getSubnetKey('::ffff:203.0.113.9'), '203.0.113.0/24');
  assert.equal(getSubnetKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
  assert.equal(getSubnetKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(getSubnetKey('[2001:DB8::1]'), '2001:db8:0:0::/64');
});

test('getSubnetKey / normalizeIp: reject junk', () => {
  for (const bad of [undefined, null, '', 'not-an-ip', '999.1.1.1', 42]) {
    assert.equal(getSubnetKey(bad), null);
    assert.equal(normalizeIp(bad), null);
  }
});

test('createProxyMatcher: exact IPs and IPv4 CIDR ranges', () => {
  const match = createProxyMatcher(['192.0.2.10', '198.51.100.0/24', 'bad-entry', '10.0.0.0/99']);
  assert.equal(match('192.0.2.10'), '192.0.2.10');
  assert.equal(match('198.51.100.200'), '198.51.100.200');
  assert.equal(match('198.51.101.1'), null);
  assert.equal(match('10.0.0.1'), null);
  assert.equal(match('garbage'), null);
});

test('recordSignup: flags once distinct accounts from one /24 reach the threshold', async () => {
  const db = await makeDb();
  const detector = createFraudDetector({ db, subnetThreshold: 3, logger: {} });

  assert.deepEqual(
    detector.recordSignup({ campaignId: 'c1', account: 'GA', ip: '203.0.113.1' }).flags,
    [],
  );
  assert.deepEqual(
    detector.recordSignup({ campaignId: 'c1', account: 'GB', ip: '203.0.113.2' }).flags,
    [],
  );
  // A repeated account must not inflate the distinct count.
  assert.deepEqual(
    detector.recordSignup({ campaignId: 'c1', account: 'GB', ip: '203.0.113.2' }).flags,
    [],
  );

  const { flags } = detector.recordSignup({ campaignId: 'c1', account: 'GC', ip: '203.0.113.3' });
  assert.equal(flags.length, 1);
  assert.equal(flags[0].rule, RULE_SUBNET_CLUSTER);
  assert.equal(flags[0].subject, '203.0.113.0/24');
  assert.equal(flags[0].accountCount, 3);
  assert.deepEqual(flags[0].accounts.sort(), ['GA', 'GB', 'GC']);
  assert.equal(flags[0].status, 'open');
});

test('recordSignup: different subnets and different campaigns are not clustered', async () => {
  const db = await makeDb();
  const detector = createFraudDetector({ db, subnetThreshold: 2, logger: {} });

  detector.recordSignup({ campaignId: 'c1', account: 'GA', ip: '203.0.113.1' });
  assert.equal(
    detector.recordSignup({ campaignId: 'c1', account: 'GB', ip: '203.0.114.1' }).flags.length,
    0,
  );
  assert.equal(
    detector.recordSignup({ campaignId: 'c2', account: 'GC', ip: '203.0.113.9' }).flags.length,
    0,
  );
  assert.equal(detector.listFlags().total, 0);
});

test('recordSignup: signups outside the sliding window do not count', async () => {
  const db = await makeDb();
  let now = Date.parse('2026-01-01T00:00:00Z');
  const detector = createFraudDetector({
    db,
    subnetThreshold: 2,
    windowMs: 60 * 60 * 1000,
    now: () => now,
    logger: {},
  });

  detector.recordSignup({ campaignId: 'c1', account: 'GA', ip: '203.0.113.1' });
  now += 2 * 60 * 60 * 1000; // 2h later — the first signup has aged out
  assert.equal(
    detector.recordSignup({ campaignId: 'c1', account: 'GB', ip: '203.0.113.2' }).flags.length,
    0,
  );

  assert.equal(detector.pruneEvents(), 1);
});

test('recordSignup: flags accounts sharing a proxy exit node across subnets', async () => {
  const db = await makeDb();
  const detector = createFraudDetector({
    db,
    subnetThreshold: 10,
    proxyThreshold: 2,
    proxyList: ['198.51.100.0/24', '192.0.2.50'],
    logger: {},
  });

  assert.equal(
    detector.recordSignup({ campaignId: 'c1', account: 'GA', ip: '192.0.2.50' }).flags.length,
    0,
  );
  assert.equal(
    detector.recordSignup({ campaignId: 'c1', account: 'GA', ip: '192.0.2.50' }).flags.length,
    0,
    'the same account twice is still one account',
  );

  const { flags } = detector.recordSignup({ campaignId: 'c1', account: 'GB', ip: '192.0.2.50' });
  assert.equal(flags.length, 1);
  assert.equal(flags[0].rule, RULE_PROXY_EXIT);
  assert.equal(flags[0].subject, '192.0.2.50');
  assert.equal(flags[0].accountCount, 2);

  // A non-proxy address in the same range of accounts never raises the proxy rule.
  assert.equal(
    detector.recordSignup({ campaignId: 'c1', account: 'GC', ip: '203.0.113.5' }).flags.length,
    0,
  );
});

test('flags: list/filter, status updates, and dismissed flags reopen when the cluster grows', async () => {
  const db = await makeDb();
  const detector = createFraudDetector({ db, subnetThreshold: 2, logger: {} });
  detector.recordSignup({ campaignId: 'c1', account: 'GA', ip: '203.0.113.1' });
  const [flag] = detector.recordSignup({
    campaignId: 'c1',
    account: 'GB',
    ip: '203.0.113.2',
  }).flags;

  assert.equal(detector.listFlags({ status: 'open' }).total, 1);
  assert.equal(detector.listFlags({ campaignId: 'other' }).total, 0);

  assert.equal(detector.updateFlagStatus(flag.id, 'dismissed').status, 'dismissed');
  assert.equal(detector.updateFlagStatus(9999, 'confirmed'), null);
  assert.throws(() => detector.updateFlagStatus(flag.id, 'bogus'), /Invalid status/);

  const [grown] = detector.recordSignup({
    campaignId: 'c1',
    account: 'GC',
    ip: '203.0.113.3',
  }).flags;
  assert.equal(grown.id, flag.id, 'the same flag row is refreshed, not duplicated');
  assert.equal(grown.accountCount, 3);
  assert.equal(grown.status, 'open', 'a dismissed flag reopens when more accounts join');
});

test('recordSignup: ignores signups without a usable IP', async () => {
  const db = await makeDb();
  const detector = createFraudDetector({ db, logger: {} });
  assert.deepEqual(
    detector.recordSignup({ campaignId: 'c1', account: 'GA', ip: undefined }).flags,
    [],
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM signup_events').get().n, 0);
});

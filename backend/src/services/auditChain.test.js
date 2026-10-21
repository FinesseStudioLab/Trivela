import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalise, computeEntryHash, GENESIS_HASH } from './auditChain.js';

const entry = {
  actor: 'apiKey:abcd...wxyz',
  action: 'update',
  entity: 'campaign',
  entityId: '1',
  diff: { before: { name: 'a' }, after: { name: 'b' } },
  orgId: null,
  createdAt: '2026-10-18T00:00:00.000Z',
};

test('canonicalise is stable and fills missing fields with null', () => {
  assert.equal(canonicalise({}), canonicalise({ actor: null, action: null }));
  assert.deepEqual(JSON.parse(canonicalise(entry)).diff, entry.diff);
});

test('an entry without an IP hashes exactly as it did before the IP column existed', () => {
  assert.equal('ipAddress' in JSON.parse(canonicalise(entry)), false);
  assert.equal(canonicalise({ ...entry, ipAddress: null }), canonicalise(entry));
  assert.equal(canonicalise({ ...entry, ipAddress: '' }), canonicalise(entry));
});

test('an IP address changes the canonical form and the hash', () => {
  const withIp = { ...entry, ipAddress: '203.0.113.9' };
  assert.equal(JSON.parse(canonicalise(withIp)).ipAddress, '203.0.113.9');
  assert.notEqual(computeEntryHash(GENESIS_HASH, withIp), computeEntryHash(GENESIS_HASH, entry));
});

test('the hash depends on the previous hash', () => {
  const a = computeEntryHash(GENESIS_HASH, entry);
  const b = computeEntryHash(a, entry);
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

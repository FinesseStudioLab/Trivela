// Tests for the contract event standard linter (#1196).
// Run: node --test scripts/check-contract-events.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyze,
  parsePublishCalls,
  parseSymbolConsts,
  replaceCatalog,
  renderCatalog,
  resolveDiscriminant,
  BEGIN_MARKER,
  END_MARKER,
} from './check-contract-events.mjs';

const SRC = `
const CREDIT_EVENT: Symbol = symbol_short!("credit");
pub fn credit(env: Env, user: Address, amount: u64) {
    env.events().publish((CREDIT_EVENT, user.clone()), amount);
}
pub fn multi(env: Env, a: Address) {
    env.events()
        .publish(
            (CREDIT_EVENT, a, campaign_id),
            (x, y),
        ); // trailing comment with publish(
}
`;

test('parses consts and single/multi-line publish calls with enclosing fn', () => {
  assert.equal(parseSymbolConsts(SRC).get('CREDIT_EVENT'), 'credit');
  const calls = parsePublishCalls(SRC);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].topics, ['CREDIT_EVENT', 'user.clone()']);
  assert.equal(calls[0].data, 'amount');
  assert.equal(calls[0].fn, 'credit');
  assert.deepEqual(calls[1].topics, ['CREDIT_EVENT', 'a', 'campaign_id']);
  assert.equal(calls[1].data, '(x, y)');
  assert.equal(calls[1].fn, 'multi');
});

test('E1: topics must be a tuple led by an event Symbol', () => {
  const consts = new Map([['CREDIT_EVENT', 'credit']]);
  assert.match(resolveDiscriminant({ raw: 'CREDIT_EVENT', topics: ['CREDIT_EVENT'] }, consts).error, /E1/);
  assert.match(resolveDiscriminant({ raw: '(user, CREDIT_EVENT)', topics: ['user', 'CREDIT_EVENT'] }, consts).error, /E1/);
  assert.deepEqual(resolveDiscriminant({ raw: '(CREDIT_EVENT,)', topics: ['CREDIT_EVENT'] }, consts), {
    event: 'credit',
    constName: 'CREDIT_EVENT',
    inline: false,
  });
});

test('E2: inline discriminants are rejected unless grandfathered', () => {
  const files = {
    'contracts/rewards/src/lib.rs': `fn a(env: Env) { env.events().publish((Symbol::new(&env, "brand_new"), u), 1); }
fn b(env: Env) { env.events().publish((Symbol::new(&env, "tier_credit"), u), 1); }`,
    'contracts/campaign/src/lib.rs': '',
    'contracts/nullifiers/src/lib.rs': '',
  };
  const { rows, errors } = analyze((p) => files[p]);
  assert.equal(rows.length, 2);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /E2: event "brand_new"/);
});

test('catalog render is deterministic and replaces only the marked block', () => {
  const rows = [
    { contract: 'RewardsContract', event: 'credit', constName: 'CREDIT_EVENT', topics: ['user'], data: 'amount', fn: 'credit' },
    { contract: 'RewardsContract', event: 'claim', constName: 'CLAIM_EVENT', topics: [], data: '', fn: 'claim' },
  ];
  const catalog = renderCatalog(rows);
  assert.ok(catalog.indexOf('`claim`') < catalog.indexOf('`credit`'));
  assert.match(catalog, /\| `claim` \| `CLAIM_EVENT` \| — \| — \| `claim\(\)` \|/);
  const doc = `intro\n${BEGIN_MARKER}\nold\n${END_MARKER}\noutro`;
  const next = replaceCatalog(doc, catalog);
  assert.ok(next.startsWith('intro\n') && next.endsWith('\noutro'));
  assert.equal(replaceCatalog(next, catalog), next);
});

test('the real workspace currently satisfies the standard', () => {
  const { rows, errors } = analyze();
  assert.deepEqual(errors, []);
  assert.ok(rows.length > 0);
});

// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify,
  generateReferralCode,
  buildReferralLink,
  createReferralCodeService,
} from './referralCodeService.js';

test('slugify lowercases and hyphenates display names', () => {
  assert.equal(slugify('Jane Doe'), 'jane-doe');
});

test('slugify strips leading @ from Twitter handles', () => {
  assert.equal(slugify('@CryptoJane'), 'cryptojane');
});

test('slugify collapses punctuation into single hyphens', () => {
  assert.equal(slugify('foo!!bar  baz'), 'foo-bar-baz');
});

test('slugify strips leading/trailing hyphens', () => {
  assert.equal(slugify('  --hello--  '), 'hello');
});

test('slugify returns empty string for non-alphanumeric input', () => {
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify(''), '');
});

test('slugify caps length at 64 characters', () => {
  assert.equal(slugify('a'.repeat(100)), 'a'.repeat(64));
});

test('generateReferralCode returns code and trivela.network/ref/ link', () => {
  const { code, link } = generateReferralCode('Jane Doe');
  assert.equal(code, 'jane-doe');
  assert.equal(link, 'https://trivela.network/ref/jane-doe');
});

test('generateReferralCode throws for empty / non-alphanumeric names', () => {
  assert.throws(() => generateReferralCode(''));
  assert.throws(() => generateReferralCode('---'));
});

test('buildReferralLink builds the public ref URL', () => {
  assert.equal(buildReferralLink('cryptojane'), 'https://trivela.network/ref/cryptojane');
});

test('createReferralCodeService exposes the generator helpers', () => {
  const svc = createReferralCodeService();
  assert.equal(typeof svc.generateReferralCode, 'function');
  assert.equal(svc.generateReferralCode('Ada').code, 'ada');
});

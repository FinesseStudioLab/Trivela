import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import Database from 'better-sqlite3';
import request from 'supertest';
import { runMigrations } from '../db/migrate.js';
import { createApp } from '../index.js';
import {
  createGithubTaskStore,
  extractVerifiedTask,
  verifyGithubSignature,
} from './githubWebhook.js';

const SECRET = 'whsec_test';
const sign = (body, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

const mergedPr = (over = {}) => ({
  action: 'closed',
  repository: { full_name: 'acme/widgets' },
  pull_request: {
    number: 12,
    merged: true,
    merged_at: '2026-09-26T00:00:00Z',
    title: 'Fix bug',
    html_url: 'https://github.com/acme/widgets/pull/12',
    user: { login: 'Octo-Dev' },
  },
  ...over,
});

const closedIssue = (over = {}) => ({
  action: 'closed',
  repository: { full_name: 'acme/widgets' },
  issue: {
    number: 7,
    title: 'Bug',
    state_reason: 'completed',
    html_url: 'https://github.com/acme/widgets/issues/7',
    closed_at: '2026-09-26T01:00:00Z',
  },
  sender: { login: 'octo-dev' },
  ...over,
});

test('verifyGithubSignature accepts the right HMAC and rejects everything else', () => {
  const body = Buffer.from('{"a":1}');
  assert.equal(verifyGithubSignature(body, sign(body), SECRET), true);
  assert.equal(verifyGithubSignature(body, sign(body, 'other'), SECRET), false);
  assert.equal(verifyGithubSignature(body, sign(Buffer.from('{"a":2}')), SECRET), false);
  assert.equal(verifyGithubSignature(body, undefined, SECRET), false);
  assert.equal(verifyGithubSignature(body, 'sha256=abc', SECRET), false, 'wrong length');
  assert.equal(verifyGithubSignature(body, sign(body), ''), false, 'no secret configured');
});

test('extractVerifiedTask: only merged PRs and completed issue closures count', () => {
  const pr = extractVerifiedTask('pull_request', mergedPr());
  assert.deepEqual(
    { kind: pr.kind, repo: pr.repo, number: pr.number, githubLogin: pr.githubLogin },
    { kind: 'pr_merged', repo: 'acme/widgets', number: 12, githubLogin: 'Octo-Dev' },
  );

  const issue = extractVerifiedTask('issues', closedIssue());
  assert.equal(issue.kind, 'issue_closed');
  assert.equal(issue.githubLogin, 'octo-dev');

  const unmerged = mergedPr();
  unmerged.pull_request.merged = false;
  assert.equal(extractVerifiedTask('pull_request', unmerged), null, 'closed without merging');
  assert.equal(extractVerifiedTask('pull_request', mergedPr({ action: 'opened' })), null);
  assert.equal(extractVerifiedTask('issues', closedIssue({ action: 'opened' })), null);
  const notPlanned = closedIssue();
  notPlanned.issue.state_reason = 'not_planned';
  assert.equal(
    extractVerifiedTask('issues', notPlanned),
    null,
    'not_planned is not completed work',
  );
  assert.equal(extractVerifiedTask('push', { repository: { full_name: 'a/b' } }), null);
  assert.equal(extractVerifiedTask('pull_request', {}), null);
});

test('store: records once per delivery/task and matches logins case-insensitively', async () => {
  const db = new Database(':memory:');
  await runMigrations(db);
  const store = createGithubTaskStore({ db, logger: {} });
  const task = extractVerifiedTask('pull_request', mergedPr());

  assert.equal(store.record('d-1', task), true);
  assert.equal(store.record('d-1', task), false, 'same delivery');
  assert.equal(store.record('d-2', task), false, 'same task, new delivery id');

  assert.equal(
    store.isVerified({ githubLogin: 'octo-dev', repo: 'ACME/widgets', number: 12 }),
    true,
  );
  assert.equal(store.isVerified({ githubLogin: 'octo-dev', number: 13 }), false);
  assert.equal(store.isVerified({ githubLogin: 'someone-else' }), false);
  assert.equal(store.list({ githubLogin: 'OCTO-DEV' }).length, 1);
});

async function makeApp(options = {}) {
  return createApp({
    dbPath: ':memory:',
    campaigns: [],
    disableJobs: true,
    skipEnvValidation: true,
    rateLimit: { windowMs: 60_000, maxRequests: 10_000 },
    apiKeys: 'k',
    masterKey: 'master',
    githubWebhookSecret: SECRET,
    ...options,
  });
}

function deliver(app, event, payload, { id = `d-${Math.random()}`, secret = SECRET } = {}) {
  const body = JSON.stringify(payload);
  return request(app)
    .post('/api/v1/webhooks/github')
    .set('Content-Type', 'application/json')
    .set('X-GitHub-Event', event)
    .set('X-GitHub-Delivery', id)
    .set('X-Hub-Signature-256', sign(body, secret))
    .send(body);
}

test('webhook: verifies a merged PR, dedupes redeliveries and exposes the result to admins', async () => {
  const app = await makeApp();

  const first = await deliver(app, 'pull_request', mergedPr(), { id: 'delivery-1' }).expect(201);
  assert.deepEqual(
    { verified: first.body.verified, duplicate: first.body.duplicate, kind: first.body.kind },
    { verified: true, duplicate: false, kind: 'pr_merged' },
  );
  const again = await deliver(app, 'pull_request', mergedPr(), { id: 'delivery-1' }).expect(200);
  assert.equal(again.body.duplicate, true);

  const verify = await request(app)
    .get('/api/v1/admin/github-tasks/verify?githubLogin=octo-dev&repo=acme/widgets&number=12')
    .set('X-API-Key', 'master')
    .expect(200);
  assert.equal(verify.body.verified, true);

  const list = await request(app)
    .get('/api/v1/admin/github-tasks')
    .set('X-API-Key', 'master')
    .expect(200);
  assert.equal(list.body.total, 1);
});

test('webhook: a closed issue is recorded; ignored events return 202', async () => {
  const app = await makeApp();
  await deliver(app, 'issues', closedIssue()).expect(201);
  const ignored = await deliver(app, 'push', { repository: { full_name: 'a/b' } }).expect(202);
  assert.equal(ignored.body.ignored, true);
  const unmerged = mergedPr();
  unmerged.pull_request.merged = false;
  await deliver(app, 'pull_request', unmerged).expect(202);
});

test('webhook: rejects bad signatures, missing config, bad input; ping works', async () => {
  const app = await makeApp();
  const bad = await deliver(app, 'pull_request', mergedPr(), { secret: 'wrong' }).expect(401);
  assert.equal(bad.body.code, 'INVALID_SIGNATURE');

  await request(app)
    .post('/api/v1/webhooks/github')
    .set('Content-Type', 'application/json')
    .set('X-GitHub-Event', 'pull_request')
    .send(JSON.stringify(mergedPr()))
    .expect(401);

  const body = '{not json';
  await request(app)
    .post('/api/v1/webhooks/github')
    .set('Content-Type', 'application/json')
    .set('X-GitHub-Event', 'issues')
    .set('X-GitHub-Delivery', 'x')
    .set('X-Hub-Signature-256', sign(body))
    .send(body)
    .expect(400);

  await deliver(app, 'ping', { zen: 'hi' }).expect(200);

  const unconfigured = await makeApp({ githubWebhookSecret: '' });
  const res = await deliver(unconfigured, 'ping', {}).expect(503);
  assert.equal(res.body.code, 'GITHUB_WEBHOOK_NOT_CONFIGURED');
});

test('admin task lookup requires the master key and a githubLogin', async () => {
  const app = await makeApp();
  await request(app).get('/api/v1/admin/github-tasks').set('X-API-Key', 'k').expect(401);
  await request(app)
    .get('/api/v1/admin/github-tasks/verify')
    .set('X-API-Key', 'master')
    .expect(400);
});

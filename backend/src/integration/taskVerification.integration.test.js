import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import test, { after, before, describe } from 'node:test';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { up as createGithubTaskTable } from '../db/migrations/044_github_task_events.js';
import { createGithubTaskRoutes, createGithubWebhookRoutes } from '../routes/githubWebhook.js';
import { createSocialTaskRoutes } from '../routes/socialTasks.js';
import { createGithubTaskStore } from '../services/githubWebhook.js';
import { createTwitterVerificationService } from '../services/twitterVerificationService.js';

// ── A local stand-in for the Twitter API v2 ──────────────────────────────────
// The real service, route and HTTP client run unmodified; only the third-party
// network edge is replaced, so these tests exercise the whole verification path.

const TWITTER_USERS = { alice: '100', bob: '200', carol: '300' };

function createFakeTwitter() {
  /** @type {{ url: string, auth: string | undefined }[]} */
  const requests = [];
  /** @type {Record<string, (url: URL) => { status?: number, headers?: Record<string, string>, body?: unknown }>} */
  const handlers = {};
  let nextOverride = null;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    requests.push({ url: url.pathname + url.search, auth: req.headers.authorization });

    let reply;
    if (nextOverride) {
      reply = nextOverride;
      nextOverride = null;
    } else {
      const byUser = url.pathname.match(/^\/2\/users\/by\/username\/(.+)$/);
      if (byUser) {
        const id = TWITTER_USERS[decodeURIComponent(byUser[1]).toLowerCase()];
        reply = id ? { body: { data: { id, username: byUser[1] } } } : { body: {} };
      } else {
        const key = Object.keys(handlers).find((pattern) => new RegExp(pattern).test(url.pathname));
        reply = key ? handlers[key](url) : { status: 404, body: {} };
      }
    }
    res.writeHead(reply.status ?? 200, { 'content-type': 'application/json', ...reply.headers });
    res.end(JSON.stringify(reply.body ?? {}));
  });

  return {
    requests,
    handlers,
    failNextWith(reply) {
      nextOverride = reply;
    },
    listen: () =>
      new Promise((resolve) =>
        server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)),
      ),
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

describe('Twitter task verification (route + service + HTTP client)', () => {
  const twitter = createFakeTwitter();
  let baseUrl;

  before(async () => {
    baseUrl = await twitter.listen();
  });
  after(() => twitter.close());

  const appFor = (serviceOptions = {}) => {
    const app = express();
    app.use(express.json());
    app.use(
      '/social-tasks',
      createSocialTaskRoutes({
        twitterVerificationService: createTwitterVerificationService({
          bearerToken: 'test-bearer',
          baseUrl,
          ...serviceOptions,
        }),
      }),
    );
    return app;
  };
  const verify = (app, body) => request(app).post('/social-tasks/twitter/verify').send(body);

  test('a user who liked the tweet is verified, using the bearer token', async () => {
    twitter.handlers['/liking_users$'] = () => ({ body: { data: [{ id: '999' }, { id: '100' }] } });
    const res = await verify(appFor(), {
      username: 'Alice',
      task: { type: 'like', tweetId: '555' },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { verified: true, type: 'like', username: 'Alice', userId: '100' });
    assert.ok(twitter.requests.every((r) => r.auth === 'Bearer test-bearer'));
  });

  test('a user who did not like the tweet is not verified', async () => {
    twitter.handlers['/liking_users$'] = () => ({ body: { data: [{ id: '999' }] } });
    const res = await verify(appFor(), { username: 'bob', task: { type: 'like', tweetId: '555' } });

    assert.equal(res.status, 200);
    assert.equal(res.body.verified, false);
    assert.equal(res.body.reason, 'LIKE_NOT_FOUND');
  });

  test('retweet and follow tasks are checked against their own endpoints', async () => {
    twitter.handlers['/retweeted_by$'] = () => ({ body: { data: [{ id: '200' }] } });
    twitter.handlers['/following$'] = () => ({ body: { data: [{ id: '300' }] } });
    const app = appFor();

    const retweet = await verify(app, { username: 'bob', task: { type: 'retweet', tweetId: '1' } });
    assert.equal(retweet.body.verified, true);

    const follow = await verify(app, {
      username: 'alice',
      task: { type: 'follow', targetUsername: 'carol' },
    });
    assert.equal(follow.body.verified, true);

    const notFollowing = await verify(app, {
      username: 'alice',
      task: { type: 'follow', targetUsername: 'bob' },
    });
    assert.equal(notFollowing.body.verified, false);
    assert.equal(notFollowing.body.reason, 'FOLLOW_NOT_FOUND');
  });

  test('a tweet task matches recent tweet text case-insensitively', async () => {
    twitter.handlers['/tweets$'] = () => ({
      body: { data: [{ id: '1', text: 'Just joined #Trivela rewards!' }] },
    });
    const app = appFor();

    const hit = await verify(app, { username: 'alice', task: { type: 'tweet', text: '#trivela' } });
    assert.equal(hit.body.verified, true);

    const miss = await verify(app, {
      username: 'alice',
      task: { type: 'tweet', text: 'something else' },
    });
    assert.equal(miss.body.verified, false);
    assert.equal(miss.body.reason, 'TWEET_NOT_FOUND');
  });

  test('unknown users and unknown follow targets are unverified, not errors', async () => {
    const app = appFor();
    const user = await verify(app, { username: 'nobody', task: { type: 'like', tweetId: '1' } });
    assert.equal(user.status, 200);
    assert.equal(user.body.reason, 'USER_NOT_FOUND');

    const target = await verify(app, {
      username: 'alice',
      task: { type: 'follow', targetUsername: 'ghost' },
    });
    assert.equal(target.body.reason, 'TARGET_NOT_FOUND');
  });

  test('pagination is followed, but bounded by maxPages', async () => {
    let pages = 0;
    twitter.handlers['/liking_users$'] = () => {
      pages += 1;
      return { body: { data: [{ id: String(1000 + pages) }], meta: { next_token: `t${pages}` } } };
    };

    pages = 0;
    const bounded = await verify(appFor({ maxPages: 3 }), {
      username: 'alice',
      task: { type: 'like', tweetId: '9' },
    });
    assert.equal(bounded.body.verified, false);
    assert.equal(pages, 3, 'stops after maxPages even though more pages exist');

    // The match is on page 2.
    pages = 0;
    twitter.handlers['/liking_users$'] = () => {
      pages += 1;
      return pages === 2
        ? { body: { data: [{ id: '100' }] } }
        : { body: { data: [{ id: 'x' }], meta: { next_token: 'next' } } };
    };
    const found = await verify(appFor(), {
      username: 'alice',
      task: { type: 'like', tweetId: '9' },
    });
    assert.equal(found.body.verified, true);
    assert.equal(pages, 2);
  });

  test('Twitter rate limiting becomes a 429 with Retry-After', async () => {
    twitter.failNextWith({
      status: 429,
      headers: { 'x-rate-limit-reset': String(Math.floor(Date.now() / 1000) + 90) },
    });
    const res = await verify(appFor(), { username: 'alice', task: { type: 'like', tweetId: '1' } });

    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'TWITTER_RATE_LIMITED');
    assert.ok(Number(res.headers['retry-after']) > 0 && Number(res.headers['retry-after']) <= 90);
  });

  test('rejected credentials and upstream outages are reported as 502', async () => {
    const app = appFor();
    twitter.failNextWith({ status: 401 });
    const auth = await verify(app, { username: 'alice', task: { type: 'like', tweetId: '1' } });
    assert.equal(auth.status, 502);
    assert.equal(auth.body.code, 'TWITTER_AUTH_FAILED');

    twitter.failNextWith({ status: 500 });
    const outage = await verify(app, { username: 'alice', task: { type: 'like', tweetId: '1' } });
    assert.equal(outage.status, 502);
    assert.equal(outage.body.code, 'TWITTER_UNAVAILABLE');
  });

  test('an unreachable Twitter API is a 502, not a hang or a crash', async () => {
    const res = await verify(appFor({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 500 }), {
      username: 'alice',
      task: { type: 'like', tweetId: '1' },
    });
    assert.equal(res.status, 502);
    assert.equal(res.body.code, 'TWITTER_UNAVAILABLE');
  });

  test('a missing bearer token is a 503 and never calls Twitter', async () => {
    const before = twitter.requests.length;
    const app = express();
    app.use(express.json());
    app.use(
      '/social-tasks',
      createSocialTaskRoutes({
        twitterVerificationService: createTwitterVerificationService({ bearerToken: '', baseUrl }),
      }),
    );
    const res = await verify(app, { username: 'alice', task: { type: 'like', tweetId: '1' } });
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'TWITTER_NOT_CONFIGURED');
    assert.equal(twitter.requests.length, before);
  });

  test('invalid input is rejected with 400 before any Twitter call', async () => {
    const before = twitter.requests.length;
    const app = appFor();

    const badHandle = await verify(app, {
      username: 'not a handle!',
      task: { type: 'like', tweetId: '1' },
    });
    assert.equal(badHandle.status, 400);
    assert.equal(badHandle.body.code, 'INVALID_USERNAME');

    const badTask = await verify(app, { username: 'alice', task: { type: 'dance' } });
    assert.equal(badTask.status, 400);
    assert.equal(badTask.body.code, 'INVALID_TASK');

    const badTweetId = await verify(app, {
      username: 'alice',
      task: { type: 'like', tweetId: 'abc' },
    });
    assert.equal(badTweetId.status, 400);

    assert.equal(twitter.requests.length, before);
  });
});

// ── GitHub webhook → task store → admin verification lookup ──────────────────

describe('GitHub task verification webhooks (route + store, signed payloads)', () => {
  const SECRET = 'whsec_integration';
  const sign = (body, secret = SECRET) =>
    `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  const mergedPr = (over = {}) => ({
    action: 'closed',
    repository: { full_name: 'acme/widgets' },
    pull_request: {
      number: 12,
      merged: true,
      merged_at: '2026-10-01T00:00:00Z',
      title: 'Fix bug',
      html_url: 'https://github.com/acme/widgets/pull/12',
      user: { login: 'Octo-Dev' },
    },
    ...over,
  });

  function setup({ secret = SECRET } = {}) {
    const db = new Database(':memory:');
    createGithubTaskTable(db);
    const store = createGithubTaskStore({ db, logger: {} });
    const app = express();
    app.use(createGithubWebhookRoutes({ store, getSecret: () => secret, logger: { warn() {} } }));
    app.use('/admin/github-tasks', createGithubTaskRoutes({ store }));
    return { app, store, db };
  }

  const deliver = (
    app,
    payload,
    { event = 'pull_request', id = 'd-1', signature, secret } = {},
  ) => {
    const body = JSON.stringify(payload);
    const req = request(app)
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-event', event)
      .set('x-hub-signature-256', signature ?? sign(body, secret));
    if (id) req.set('x-github-delivery', id);
    return req.send(body);
  };

  test('a merged PR is recorded once and then visible to the verification lookup', async () => {
    const { app } = setup();

    const first = await deliver(app, mergedPr());
    assert.equal(first.status, 201);
    assert.deepEqual(first.body, {
      ok: true,
      verified: true,
      duplicate: false,
      kind: 'pr_merged',
      repo: 'acme/widgets',
      number: 12,
    });

    // GitHub redelivering the same event (same delivery id) is harmless.
    const redelivery = await deliver(app, mergedPr());
    assert.equal(redelivery.status, 200);
    assert.equal(redelivery.body.duplicate, true);

    // The same task under a new delivery id is still a duplicate task.
    const again = await deliver(app, mergedPr(), { id: 'd-2' });
    assert.equal(again.body.duplicate, true);

    const lookup = await request(app)
      .get('/admin/github-tasks/verify')
      .query({ githubLogin: 'octo-dev', repo: 'ACME/widgets', number: 12 });
    assert.equal(lookup.status, 200);
    assert.equal(lookup.body.verified, true);

    const list = await request(app).get('/admin/github-tasks').query({ githubLogin: 'OCTO-DEV' });
    assert.equal(list.body.total, 1);
    assert.equal(list.body.data[0].kind, 'pr_merged');
  });

  test('a PR closed without merging does not verify anything', async () => {
    const { app, store } = setup();
    const res = await deliver(
      app,
      mergedPr({ pull_request: { ...mergedPr().pull_request, merged: false } }),
    );

    assert.equal(res.status, 202);
    assert.equal(res.body.ignored, true);
    assert.equal(store.isVerified({ githubLogin: 'Octo-Dev' }), false);
  });

  test('closed issues verify the closer only when completed, not when "not planned"', async () => {
    const { app, store } = setup();
    const issue = (reason) => ({
      action: 'closed',
      repository: { full_name: 'acme/widgets' },
      issue: {
        number: 7,
        title: 'Bug',
        state_reason: reason,
        html_url: 'u',
        closed_at: '2026-10-01T00:00:00Z',
      },
      sender: { login: 'solver' },
    });

    const notPlanned = await deliver(app, issue('not_planned'), { event: 'issues', id: 'i-1' });
    assert.equal(notPlanned.status, 202);
    assert.equal(store.isVerified({ githubLogin: 'solver' }), false);

    const completed = await deliver(app, issue('completed'), { event: 'issues', id: 'i-2' });
    assert.equal(completed.status, 201);
    assert.equal(completed.body.kind, 'issue_closed');
    assert.equal(
      store.isVerified({ githubLogin: 'solver', kind: 'issue_closed', number: 7 }),
      true,
    );
  });

  test('forged or missing signatures are rejected and nothing is recorded', async () => {
    const { app, store } = setup();

    const forged = await deliver(app, mergedPr(), { secret: 'attacker-secret' });
    assert.equal(forged.status, 401);
    assert.equal(forged.body.code, 'INVALID_SIGNATURE');

    const malformed = await deliver(app, mergedPr(), { signature: 'not-a-signature' });
    assert.equal(malformed.status, 401);

    const body = JSON.stringify(mergedPr());
    const missing = await request(app)
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'd-x')
      .send(body);
    assert.equal(missing.status, 401);

    assert.equal(store.list().length, 0);
  });

  test('a payload tampered after signing is rejected', async () => {
    const { app } = setup();
    const signed = JSON.stringify(mergedPr());
    const tampered = signed.replace('Octo-Dev', 'Mallory');
    const res = await request(app)
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'd-t')
      .set('x-hub-signature-256', sign(signed))
      .send(tampered);
    assert.equal(res.status, 401);
  });

  test('an unconfigured secret is a 503', async () => {
    const { app } = setup({ secret: '' });
    const res = await deliver(app, mergedPr(), { signature: 'sha256=00' });
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'GITHUB_WEBHOOK_NOT_CONFIGURED');
  });

  test('ping events, missing delivery ids and invalid JSON are handled', async () => {
    const { app } = setup();

    const ping = await deliver(app, { zen: 'hi' }, { event: 'ping' });
    assert.equal(ping.status, 200);
    assert.equal(ping.body.event, 'ping');

    const noId = await deliver(app, mergedPr(), { id: '' });
    assert.equal(noId.status, 400);

    const raw = '{not json';
    const invalid = await request(app)
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'd-bad')
      .set('x-hub-signature-256', sign(raw))
      .send(raw);
    assert.equal(invalid.status, 400);
  });

  test('unrelated events are acknowledged and ignored', async () => {
    const { app } = setup();
    const res = await deliver(
      app,
      { repository: { full_name: 'acme/widgets' } },
      { event: 'push', id: 'p-1' },
    );
    assert.equal(res.status, 202);
    assert.equal(res.body.ignored, true);
  });

  test('the verification lookup validates its inputs', async () => {
    const { app } = setup();
    assert.equal((await request(app).get('/admin/github-tasks/verify')).status, 400);
    assert.equal(
      (
        await request(app)
          .get('/admin/github-tasks/verify')
          .query({ githubLogin: 'x', number: 'abc' })
      ).status,
      400,
    );
    const unknown = await request(app)
      .get('/admin/github-tasks/verify')
      .query({ githubLogin: 'nobody' });
    assert.equal(unknown.body.verified, false);
  });
});

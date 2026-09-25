import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTwitterVerificationService,
  parseSocialTask,
  normalizeUsername,
  SocialVerificationError,
} from './twitterVerificationService.js';

const NOW = new Date('2026-09-25T12:00:00Z');

/**
 * Fake Twitter API v2. `routes` maps a pathname to a body, a function
 * (url) => body, or { status, headers } for error responses.
 */
function fakeFetch(routes) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    const route = routes[new URL(url).pathname];
    if (route === undefined) {
      return { ok: true, status: 200, headers: new Map(), json: async () => ({}) };
    }
    const spec = typeof route === 'function' ? route(new URL(url)) : route;
    if (spec && typeof spec.status === 'number') {
      const headers = new Map(Object.entries(spec.headers ?? {}));
      return { ok: spec.status < 400, status: spec.status, headers, json: async () => spec.body ?? {} };
    }
    return { ok: true, status: 200, headers: new Map(), json: async () => spec };
  };
  return { fetch, calls };
}

const USERS = {
  '/2/users/by/username/alice': { data: { id: '100', username: 'alice' } },
  '/2/users/by/username/trivela': { data: { id: '900', username: 'trivela' } },
};

function service(routes, overrides = {}) {
  const { fetch, calls } = fakeFetch({ ...USERS, ...routes });
  return {
    svc: createTwitterVerificationService({
      bearerToken: 'test-token',
      fetch,
      now: () => NOW,
      ...overrides,
    }),
    calls,
  };
}

describe('parseSocialTask / normalizeUsername', () => {
  test('accepts each task type and normalises input', () => {
    assert.deepEqual(parseSocialTask({ type: 'tweet', text: '  #Trivela  ' }), { type: 'tweet', text: '#Trivela' });
    assert.deepEqual(parseSocialTask({ type: 'like', tweetId: '1234' }), { type: 'like', tweetId: '1234' });
    assert.deepEqual(parseSocialTask({ type: 'retweet', tweetId: '1234' }), { type: 'retweet', tweetId: '1234' });
    assert.deepEqual(parseSocialTask({ type: 'follow', targetUsername: '@Trivela' }), {
      type: 'follow',
      targetUsername: 'Trivela',
    });
    assert.equal(normalizeUsername('@alice'), 'alice');
  });

  test('rejects invalid tasks and handles', () => {
    for (const bad of [
      null,
      { type: 'quote' },
      { type: 'tweet', text: '' },
      { type: 'tweet', text: 'x'.repeat(281) },
      { type: 'like', tweetId: 'abc' },
      { type: 'retweet' },
      { type: 'follow', targetUsername: 'not a handle!' },
    ]) {
      assert.throws(() => parseSocialTask(bad), (err) => err instanceof SocialVerificationError && err.code === 'INVALID_TASK');
    }
    assert.equal(normalizeUsername('way_too_long_handle_x'), null);
    assert.equal(normalizeUsername(42), null);
  });
});

describe('verifyTask', () => {
  test('tweet: verified when a recent tweet contains the text (case-insensitive)', async () => {
    const { svc, calls } = service({
      '/2/users/100/tweets': { data: [{ id: '1', text: 'gm' }, { id: '2', text: 'Loving #TRIVELA quests' }] },
    });
    const result = await svc.verifyTask({ username: '@alice', task: { type: 'tweet', text: '#trivela' } });
    assert.deepEqual(result, { verified: true, type: 'tweet', username: 'alice', userId: '100' });

    const timeline = calls.find((c) => c.url.pathname === '/2/users/100/tweets').url;
    assert.equal(timeline.searchParams.get('start_time'), '2026-09-22T12:00:00.000Z');
    assert.equal(timeline.searchParams.get('exclude'), 'retweets');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token');
  });

  test('tweet: not verified when no tweet matches', async () => {
    const { svc } = service({ '/2/users/100/tweets': { data: [{ id: '1', text: 'gm' }] } });
    const result = await svc.verifyTask({ username: 'alice', task: { type: 'tweet', text: '#trivela' } });
    assert.equal(result.verified, false);
    assert.equal(result.reason, 'TWEET_NOT_FOUND');
  });

  test('like: follows pagination until the user is found', async () => {
    const { svc, calls } = service({
      '/2/tweets/555/liking_users': (url) =>
        url.searchParams.get('pagination_token') === 'p2'
          ? { data: [{ id: '100' }] }
          : { data: [{ id: '1' }, { id: '2' }], meta: { next_token: 'p2' } },
    });
    const result = await svc.verifyTask({ username: 'alice', task: { type: 'like', tweetId: '555' } });
    assert.equal(result.verified, true);
    assert.equal(calls.filter((c) => c.url.pathname === '/2/tweets/555/liking_users').length, 2);
  });

  test('retweet: not verified when the user is absent', async () => {
    const { svc } = service({ '/2/tweets/555/retweeted_by': { data: [{ id: '7' }] } });
    const result = await svc.verifyTask({ username: 'alice', task: { type: 'retweet', tweetId: '555' } });
    assert.deepEqual(result, {
      verified: false,
      reason: 'RETWEET_NOT_FOUND',
      type: 'retweet',
      username: 'alice',
      userId: '100',
    });
  });

  test('follow: verified when the target is in the following list', async () => {
    const { svc } = service({ '/2/users/100/following': { data: [{ id: '5' }, { id: '900' }] } });
    const result = await svc.verifyTask({ username: 'alice', task: { type: 'follow', targetUsername: 'trivela' } });
    assert.equal(result.verified, true);
  });

  test('follow: reports a missing target account', async () => {
    const { svc } = service({ '/2/users/by/username/ghost': { errors: [{ title: 'Not Found Error' }] } });
    const result = await svc.verifyTask({ username: 'alice', task: { type: 'follow', targetUsername: 'ghost' } });
    assert.equal(result.verified, false);
    assert.equal(result.reason, 'TARGET_NOT_FOUND');
  });

  test('unknown user is not verified and makes no further calls', async () => {
    const { svc, calls } = service({ '/2/users/by/username/nobody': { errors: [{ title: 'Not Found Error' }] } });
    const result = await svc.verifyTask({ username: 'nobody', task: { type: 'like', tweetId: '1' } });
    assert.deepEqual(result, { verified: false, reason: 'USER_NOT_FOUND', type: 'like', username: 'nobody' });
    assert.equal(calls.length, 1);
  });

  test('stops after maxPages without verifying', async () => {
    const { svc, calls } = service(
      { '/2/tweets/555/liking_users': { data: [{ id: '1' }], meta: { next_token: 'more' } } },
      { maxPages: 3 },
    );
    const result = await svc.verifyTask({ username: 'alice', task: { type: 'like', tweetId: '555' } });
    assert.equal(result.verified, false);
    assert.equal(calls.filter((c) => c.url.pathname === '/2/tweets/555/liking_users').length, 3);
  });

  test('rejects an invalid username before calling the API', async () => {
    const { svc, calls } = service({});
    await assert.rejects(
      svc.verifyTask({ username: 'bad handle', task: { type: 'like', tweetId: '1' } }),
      (err) => err.code === 'INVALID_USERNAME' && err.status === 400,
    );
    assert.equal(calls.length, 0);
  });
});

describe('API failure handling', () => {
  test('not configured without a bearer token', async () => {
    const { svc } = service({}, { bearerToken: '' });
    assert.equal(svc.isConfigured(), false);
    await assert.rejects(
      svc.verifyTask({ username: 'alice', task: { type: 'like', tweetId: '1' } }),
      (err) => err.code === 'TWITTER_NOT_CONFIGURED' && err.status === 503,
    );
  });

  test('rate limit maps to 429 with retry-after from x-rate-limit-reset', async () => {
    const reset = String(NOW.getTime() / 1000 + 120);
    const { svc } = service({
      '/2/users/by/username/alice': { status: 429, headers: { 'x-rate-limit-reset': reset } },
    });
    await assert.rejects(
      svc.verifyTask({ username: 'alice', task: { type: 'like', tweetId: '1' } }),
      (err) => err.code === 'TWITTER_RATE_LIMITED' && err.status === 429 && err.retryAfterSeconds === 120,
    );
  });

  test('credential rejection and server errors map to 502', async () => {
    for (const [status, code] of [[401, 'TWITTER_AUTH_FAILED'], [503, 'TWITTER_UNAVAILABLE']]) {
      const { svc } = service({ '/2/users/by/username/alice': { status } });
      await assert.rejects(
        svc.verifyTask({ username: 'alice', task: { type: 'like', tweetId: '1' } }),
        (err) => err.code === code && err.status === 502,
      );
    }
  });

  test('network errors and timeouts map to 502', async () => {
    const svc = createTwitterVerificationService({
      bearerToken: 't',
      fetch: async (_url, { signal }) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
      timeoutMs: 10,
    });
    await assert.rejects(
      svc.verifyTask({ username: 'alice', task: { type: 'like', tweetId: '1' } }),
      (err) => err.code === 'TWITTER_UNAVAILABLE' && /timed out/.test(err.message),
    );
  });
});

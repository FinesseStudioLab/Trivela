import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createSocialTaskRoutes } from './socialTasks.js';
import { SocialVerificationError } from '../services/twitterVerificationService.js';

function appWith(verifyTask, extra = {}) {
  const app = express();
  app.use(express.json());
  app.use('/social-tasks', createSocialTaskRoutes({ twitterVerificationService: { verifyTask }, ...extra }));
  return app;
}

describe('POST /social-tasks/twitter/verify (#1243)', () => {
  test('returns the verification result and forwards the body', async () => {
    let received;
    const app = appWith(async (input) => {
      received = input;
      return { verified: true, type: 'like', username: 'alice', userId: '100' };
    });
    const task = { type: 'like', tweetId: '555' };
    const res = await request(app).post('/social-tasks/twitter/verify').send({ username: 'alice', task });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { verified: true, type: 'like', username: 'alice', userId: '100' });
    assert.deepEqual(received, { username: 'alice', task });
  });

  test('an unverified task is a 200 with verified=false (never awards points)', async () => {
    const app = appWith(async () => ({ verified: false, reason: 'LIKE_NOT_FOUND', type: 'like', username: 'alice' }));
    const res = await request(app).post('/social-tasks/twitter/verify').send({ username: 'alice', task: {} });
    assert.equal(res.status, 200);
    assert.equal(res.body.verified, false);
    assert.equal(res.body.reason, 'LIKE_NOT_FOUND');
  });

  test('maps verification errors to their status and code', async () => {
    const app = appWith(async () => {
      throw new SocialVerificationError('task.type must be one of: tweet', { code: 'INVALID_TASK', status: 400 });
    });
    const res = await request(app).post('/social-tasks/twitter/verify').send({});
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'task.type must be one of: tweet', code: 'INVALID_TASK' });
  });

  test('sets Retry-After when Twitter rate-limits', async () => {
    const app = appWith(async () => {
      throw new SocialVerificationError('Twitter API rate limit reached', {
        code: 'TWITTER_RATE_LIMITED',
        status: 429,
        retryAfterSeconds: 120,
      });
    });
    const res = await request(app).post('/social-tasks/twitter/verify').send({});
    assert.equal(res.status, 429);
    assert.equal(res.headers['retry-after'], '120');
    assert.equal(res.body.code, 'TWITTER_RATE_LIMITED');
  });

  test('unexpected errors go to the error handler', async () => {
    const app = appWith(async () => {
      throw new Error('boom');
    });
    app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
    const res = await request(app).post('/social-tasks/twitter/verify').send({});
    assert.equal(res.status, 500);
    assert.equal(res.body.error, 'boom');
  });

  test('applies requireApiKey when provided', async () => {
    const app = appWith(async () => ({ verified: true }), {
      requireApiKey: (_req, res) => res.status(401).json({ error: 'unauthorized' }),
    });
    const res = await request(app).post('/social-tasks/twitter/verify').send({});
    assert.equal(res.status, 401);
  });
});

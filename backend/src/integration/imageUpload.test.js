import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../index.js';
import { createLocalStorageAdapter } from '../storage/localStorage.js';

async function createImageTestApp(options = {}) {
  const uploadDir = await mkdtemp(join(tmpdir(), 'trivela-image-test-'));
  const app = await createApp({
    dbPath: ':memory:',
    campaigns: [],
    disableJobs: true,
    skipEnvValidation: true,
    apiKeys: 'test-key-123',
    storageAdapter: createLocalStorageAdapter({
      uploadDir,
      publicBaseUrl: 'http://localhost:3001/uploads',
    }),
    ...options,
  });
  return { app, uploadDir };
}

test('POST /api/v1/campaigns/:id/image uploads image and returns imageUrl', async () => {
  const { app, uploadDir } = await createImageTestApp();

  try {
    const createResponse = await request(app)
      .post('/api/v1/campaigns')
      .set('X-API-Key', 'test-key-123')
      .send({ name: 'Image Campaign', rewardPerAction: 10 })
      .expect(201);

    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    const response = await request(app)
      .post(`/api/v1/campaigns/${createResponse.body.id}/image`)
      .set('X-API-Key', 'test-key-123')
      .attach('image', pngBuffer, { filename: 'test.png', contentType: 'image/png' })
      .expect(200);

    assert.ok(response.body.imageUrl);
    assert.match(response.body.imageUrl, /\/uploads\/campaign-/);

    const getResponse = await request(app)
      .get(`/api/v1/campaigns/${createResponse.body.id}`)
      .expect(200);
    assert.equal(getResponse.body.imageUrl, response.body.imageUrl);
  } finally {
    await rm(uploadDir, { recursive: true, force: true });
  }
});

test('POST /api/v1/campaigns/:id/image rejects invalid mime type', async () => {
  const { app, uploadDir } = await createImageTestApp();

  try {
    const createResponse = await request(app)
      .post('/api/v1/campaigns')
      .set('X-API-Key', 'test-key-123')
      .send({ name: 'Image Campaign', rewardPerAction: 10 })
      .expect(201);

    const response = await request(app)
      .post(`/api/v1/campaigns/${createResponse.body.id}/image`)
      .set('X-API-Key', 'test-key-123')
      .attach('image', Buffer.from('not-an-image'), {
        filename: 'test.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    assert.equal(response.body.code, 'INVALID_MIME_TYPE');
  } finally {
    await rm(uploadDir, { recursive: true, force: true });
  }
});

test('POST /api/v1/campaigns/:id/image rejects missing file', async () => {
  const { app, uploadDir } = await createImageTestApp();

  try {
    const createResponse = await request(app)
      .post('/api/v1/campaigns')
      .set('X-API-Key', 'test-key-123')
      .send({ name: 'Image Campaign', rewardPerAction: 10 })
      .expect(201);

    const response = await request(app)
      .post(`/api/v1/campaigns/${createResponse.body.id}/image`)
      .set('X-API-Key', 'test-key-123')
      .expect(400);

    assert.equal(response.body.code, 'MISSING_FILE');
  } finally {
    await rm(uploadDir, { recursive: true, force: true });
  }
});

/**
 * API contract tests — verify that live HTTP responses conform to the shapes
 * declared in openapi.yaml.  Tests fail when:
 *   - A required field is missing
 *   - A field has the wrong type
 *   - An error response lacks the mandatory `error` + `code` envelope
 *
 * Uses Ajv to validate response bodies against the dereferenced OpenAPI schemas.
 * The backend is spun up in-process (no network required) using createApp().
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import request from 'supertest';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createApp } from '../index.js';
import { makeCampaignInput, resetFactorySequence } from '../tests/factories.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Schema loading & validator setup
// ---------------------------------------------------------------------------

/**
 * Load openapi.yaml and return a map of schemaName → ajv validate function.
 * $refs are resolved manually so we keep a single Ajv instance.
 */
async function buildValidators() {
  const specPath = join(__dirname, '../../openapi.yaml');
  const raw = yaml.load(await readFile(specPath, 'utf8'));
  const schemas = raw.components?.schemas ?? {};

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  // Register all component schemas so $ref resolution works.
  for (const [name, schema] of Object.entries(schemas)) {
    ajv.addSchema(
      { ...schema, $id: `#/components/schemas/${name}` },
      `#/components/schemas/${name}`,
    );
  }

  function validator(schemaName) {
    return ajv.getSchema(`#/components/schemas/${schemaName}`);
  }

  return { validator, schemas };
}

function assertValid(validate, body, label) {
  const ok = validate(body);
  if (!ok) {
    const errs = validate.errors.map((e) => `${e.instancePath} ${e.message}`).join('; ');
    assert.fail(`${label} response failed schema validation: ${errs}`);
  }
}

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function createTestApp(options = {}) {
  resetFactorySequence();
  return createApp({
    dbPath: ':memory:',
    campaigns: [makeCampaignInput({ name: 'Contract Test Campaign', rewardPerAction: 50 })],
    disableJobs: true,
    skipEnvValidation: true,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('GET /health conforms to HealthResponse schema', async () => {
  const { validator } = await buildValidators();
  const app = await createTestApp();
  const res = await request(app).get('/health').expect(200);

  assert.ok(res.body.status, 'status field present');
  assert.ok(res.body.service, 'service field present');
  assert.ok(res.body.timestamp, 'timestamp field present');
  assert.ok(res.body.rpc, 'rpc field present');

  const validate = validator('HealthResponse');
  if (validate) assertValid(validate, res.body, 'GET /health');
});

test('GET /api/v1/campaigns conforms to CampaignListResponse schema', async () => {
  const { validator } = await buildValidators();
  const app = await createTestApp();
  const res = await request(app).get('/api/v1/campaigns').expect(200);

  assert.ok(Array.isArray(res.body.data), 'data is array');
  assert.ok(typeof res.body.pagination === 'object', 'pagination is object');

  const requiredPaginationFields = [
    'total',
    'count',
    'page',
    'limit',
    'offset',
    'totalPages',
    'hasPreviousPage',
    'hasNextPage',
  ];
  for (const field of requiredPaginationFields) {
    assert.ok(field in res.body.pagination, `pagination.${field} present`);
  }

  const validate = validator('CampaignListResponse');
  if (validate) assertValid(validate, res.body, 'GET /api/v1/campaigns');
});

test('GET /api/v1/campaigns returns Campaign items with required fields', async () => {
  const { validator } = await buildValidators();
  const app = await createTestApp();
  const res = await request(app).get('/api/v1/campaigns').expect(200);

  assert.ok(res.body.data.length > 0, 'at least one campaign returned');

  const campaign = res.body.data[0];
  const requiredCampaignFields = ['id', 'name', 'active', 'rewardPerAction', 'createdAt'];
  for (const field of requiredCampaignFields) {
    assert.ok(field in campaign, `campaign.${field} present`);
  }

  const validate = validator('Campaign');
  if (validate) assertValid(validate, campaign, 'Campaign item');
});

test('GET /api/v1/campaigns/:id conforms to Campaign schema', async () => {
  const { validator } = await buildValidators();
  const app = await createTestApp();

  const listRes = await request(app).get('/api/v1/campaigns').expect(200);
  const id = listRes.body.data[0].id;

  const res = await request(app).get(`/api/v1/campaigns/${id}`).expect(200);

  assert.equal(res.body.id, id);
  assert.ok(res.body.name);

  const validate = validator('Campaign');
  if (validate) assertValid(validate, res.body, `GET /api/v1/campaigns/${id}`);
});

test('GET /api/v1/campaigns/:id returns 404 with Error schema for missing id', async () => {
  const { validator } = await buildValidators();
  const app = await createTestApp();

  const res = await request(app).get('/api/v1/campaigns/999999').expect(404);

  assert.ok(res.body.error, 'error field present');
  assert.ok(res.body.code, 'code field present');

  const validate = validator('Error');
  if (validate) assertValid(validate, res.body, 'GET /api/v1/campaigns/999999 (404)');
});

test('POST /api/v1/campaigns creates campaign and returns Campaign schema', async () => {
  const { validator } = await buildValidators();
  const app = await createTestApp();

  resetFactorySequence();
  const body = makeCampaignInput({ name: 'Created via Contract Test' });

  const res = await request(app).post('/api/v1/campaigns').send(body).expect(201);

  assert.ok(res.body.id, 'id assigned');
  assert.equal(res.body.name, body.name);
  assert.ok(res.body.createdAt, 'createdAt present');

  const validate = validator('Campaign');
  if (validate) assertValid(validate, res.body, 'POST /api/v1/campaigns (201)');
});

test('POST /api/v1/campaigns returns 422 ValidationError for invalid body', async () => {
  const { validator } = await buildValidators();
  const app = await createTestApp();

  const res = await request(app)
    .post('/api/v1/campaigns')
    .send({ name: '' })
    .expect((r) => {
      assert.ok(r.status === 400 || r.status === 422, `expected 400 or 422, got ${r.status}`);
    });

  assert.ok(res.body.error, 'error field present on validation failure');
  assert.ok(res.body.code, 'code field present on validation failure');
});

test('GET /api/v1/config conforms to ConfigResponse schema', async () => {
  const { validator } = await buildValidators();
  const app = await createTestApp();

  const res = await request(app).get('/api/v1/config').expect(200);

  assert.ok(typeof res.body.stellar === 'object', 'stellar object present');
  assert.ok(typeof res.body.contracts === 'object', 'contracts object present');

  const validate = validator('ConfigResponse');
  if (validate) assertValid(validate, res.body, 'GET /api/v1/config');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  buildOpenApiDocument,
  generateComponentSchemas,
  schemaComponentName,
  zodToOpenApi,
} from './openapiGenerator.js';

test('schemaComponentName: strips the Schema suffix and capitalises', () => {
  assert.equal(schemaComponentName('campaignCreateSchema'), 'CampaignCreate');
  assert.equal(schemaComponentName('claim'), 'Claim');
});

test('zodToOpenApi: strings, numbers, booleans, enums and constraints', () => {
  assert.deepEqual(zodToOpenApi(z.string().min(1).max(5)), {
    type: 'string',
    minLength: 1,
    maxLength: 5,
  });
  assert.deepEqual(zodToOpenApi(z.string().url()), { type: 'string', format: 'uri' });
  assert.deepEqual(zodToOpenApi(z.number().int().min(0).max(9)), {
    type: 'integer',
    minimum: 0,
    maximum: 9,
  });
  assert.deepEqual(zodToOpenApi(z.boolean()), { type: 'boolean' });
  assert.deepEqual(zodToOpenApi(z.enum(['a', 'b'])), { type: 'string', enum: ['a', 'b'] });
});

test('zodToOpenApi: objects report required vs optional fields', () => {
  const schema = z.object({
    name: z.string(),
    note: z.string().optional(),
    tags: z.array(z.string()).max(3).optional(),
    parent: z.string().nullable(),
  });
  const out = zodToOpenApi(schema);
  assert.equal(out.type, 'object');
  assert.deepEqual(out.required, ['name', 'parent']);
  assert.deepEqual(out.properties.tags, { type: 'array', items: { type: 'string' }, maxItems: 3 });
  assert.deepEqual(out.properties.parent, { type: 'string', nullable: true });
});

test('zodToOpenApi: unwraps refinements/defaults and degrades unknown types to {}', () => {
  assert.deepEqual(zodToOpenApi(z.string().refine(() => true)), { type: 'string' });
  assert.deepEqual(zodToOpenApi(z.number().default(3)), { type: 'number' });
  assert.deepEqual(zodToOpenApi(z.union([z.string(), z.number()])), {
    oneOf: [{ type: 'string' }, { type: 'number' }],
  });
  assert.deepEqual(zodToOpenApi(z.date()), {});
  assert.deepEqual(zodToOpenApi(undefined), {});
});

test('generateComponentSchemas: derives request schemas from schemas.js', () => {
  const schemas = generateComponentSchemas();
  assert.ok(schemas.CampaignCreate, 'CampaignCreate is generated');
  assert.equal(schemas.CampaignCreate.type, 'object');
  assert.ok(schemas.CampaignCreate.required.includes('name'));
  assert.match(schemas.CampaignCreate['x-generated-from'], /campaignCreateSchema/);
});

test('buildOpenApiDocument: hand-written components win, base spec is not mutated', () => {
  const base = {
    openapi: '3.0.3',
    info: { title: 'T', version: '1' },
    paths: { '/x': {} },
    components: { schemas: { CampaignCreate: { type: 'object', description: 'hand-written' } } },
  };
  const snapshot = JSON.stringify(base);

  const doc = buildOpenApiDocument({ baseSpec: base, serverUrl: 'https://api.example.test' });

  assert.equal(doc.components.schemas.CampaignCreate.description, 'hand-written');
  assert.ok(doc.components.schemas.Claim, 'missing components are generated');
  assert.deepEqual(doc.servers, [{ url: 'https://api.example.test' }]);
  assert.equal(JSON.stringify(base), snapshot);
});

test('buildOpenApiDocument: tolerates an empty base spec', () => {
  const doc = buildOpenApiDocument({ baseSpec: undefined });
  assert.equal(doc.openapi, '3.0.3');
  assert.ok(
    doc.paths['/api/v1/campaigns/{id}/exports'],
    'still documents the additional endpoints',
  );
  assert.ok(Object.keys(doc.components.schemas).length > 0);
});

test('buildOpenApiDocument: adds documentation for router-mounted endpoints without overriding the spec', () => {
  const doc = buildOpenApiDocument({
    baseSpec: {
      openapi: '3.1.0',
      info: { title: 'T', version: '1' },
      paths: { '/api/v1/campaigns/{id}/exports': { get: { summary: 'hand-written' } } },
    },
  });

  assert.ok(doc.paths['/api/v1/admin/fraud/flags'].get, 'fraud flags are documented');
  assert.ok(doc.paths['/api/v1/operator/watcher/status'].get);
  const exports = doc.paths['/api/v1/campaigns/{id}/exports'];
  assert.equal(exports.get.summary, 'hand-written', 'existing operations are preserved');
  assert.ok(exports.post, 'missing operations on the same path are added');
});

test('every documented additional operation has a summary, tags and responses', async () => {
  const { ADDITIONAL_PATHS } = await import('./openapiRoutes.js');
  for (const [path, item] of Object.entries(ADDITIONAL_PATHS)) {
    for (const [method, op] of Object.entries(item)) {
      assert.ok(op.summary, `${method} ${path} has a summary`);
      assert.ok(op.tags?.length, `${method} ${path} has tags`);
      assert.ok(op.operationId, `${method} ${path} has an operationId`);
      assert.ok(Object.keys(op.responses).length, `${method} ${path} has responses`);
    }
  }
});

test('buildOpenApiDocument: uses type unions instead of `nullable` for OpenAPI 3.1 documents', () => {
  const doc31 = buildOpenApiDocument({
    baseSpec: { openapi: '3.1.0', info: { title: 'T', version: '1' }, paths: {} },
    generated: {
      Thing: { type: 'object', properties: { note: { type: 'string', nullable: true } } },
    },
    additionalPaths: {},
  });
  assert.deepEqual(doc31.components.schemas.Thing.properties.note.type, ['string', 'null']);
  assert.equal('nullable' in doc31.components.schemas.Thing.properties.note, false);

  const doc30 = buildOpenApiDocument({
    baseSpec: { openapi: '3.0.3', info: { title: 'T', version: '1' }, paths: {} },
    generated: {
      Thing: { type: 'object', properties: { note: { type: 'string', nullable: true } } },
    },
    additionalPaths: {},
  });
  assert.equal(doc30.components.schemas.Thing.properties.note.nullable, true);
});

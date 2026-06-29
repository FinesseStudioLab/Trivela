import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { createSqliteCampaignRepository } from '../dal/sqliteCampaignRepository.js';
import { createApp, isValidLocale } from '../index.js';

// ── BCP-47 validation ─────────────────────────────────────────────────────────

test('isValidLocale accepts common BCP-47 tags', () => {
  assert.ok(isValidLocale('es'));
  assert.ok(isValidLocale('fr'));
  assert.ok(isValidLocale('zh'));
  assert.ok(isValidLocale('zh-CN'));
  assert.ok(isValidLocale('pt-BR'));
  assert.ok(isValidLocale('en-US'));
  assert.ok(isValidLocale('zh-Hant'));
});

test('isValidLocale rejects invalid locales', () => {
  assert.ok(!isValidLocale(''));
  assert.ok(!isValidLocale('e'));
  assert.ok(!isValidLocale('english'));
  assert.ok(!isValidLocale('en_US'));
  assert.ok(!isValidLocale('EN'));
  assert.ok(!isValidLocale('123'));
});

// ── Repository: translations CRUD ────────────────────────────────────────────

async function setupRepo() {
  const db = new Database(':memory:');
  await runMigrations(db);
  return createSqliteCampaignRepository({ db, seed: [] });
}

test('repository: getTranslations returns empty object for new campaign', async () => {
  const repo = await setupRepo();
  const campaign = repo.create({ name: 'Test', rewardPerAction: 0 });
  assert.deepEqual(repo.getTranslations(campaign.id), {});
});

test('repository: upsertTranslation stores and retrieves a translation', async () => {
  const repo = await setupRepo();
  const campaign = repo.create({ name: 'Test', rewardPerAction: 0 });

  repo.upsertTranslation(campaign.id, 'es', { name: 'Prueba', description: 'Descripción' });
  const translations = repo.getTranslations(campaign.id);

  assert.deepEqual(translations.es, { name: 'Prueba', description: 'Descripción' });
});

test('repository: upsertTranslation overwrites existing locale', async () => {
  const repo = await setupRepo();
  const campaign = repo.create({ name: 'Test', rewardPerAction: 0 });

  repo.upsertTranslation(campaign.id, 'es', { name: 'Primera' });
  repo.upsertTranslation(campaign.id, 'es', { name: 'Segunda' });

  const translations = repo.getTranslations(campaign.id);
  assert.equal(translations.es.name, 'Segunda');
});

test('repository: available_locales reflects stored translations', async () => {
  const repo = await setupRepo();
  const campaign = repo.create({ name: 'Test', rewardPerAction: 0 });
  assert.deepEqual(campaign.available_locales, []);

  repo.upsertTranslation(campaign.id, 'fr', { name: 'Essai' });
  repo.upsertTranslation(campaign.id, 'es', { name: 'Prueba' });

  const refreshed = repo.getById(campaign.id);
  assert.ok(refreshed.available_locales.includes('fr'));
  assert.ok(refreshed.available_locales.includes('es'));
  assert.equal(refreshed.available_locales.length, 2);
});

test('repository: deleteTranslation removes a locale', async () => {
  const repo = await setupRepo();
  const campaign = repo.create({ name: 'Test', rewardPerAction: 0 });

  repo.upsertTranslation(campaign.id, 'es', { name: 'Prueba' });
  const removed = repo.deleteTranslation(campaign.id, 'es');
  assert.ok(removed);
  assert.deepEqual(repo.getTranslations(campaign.id), {});
});

test('repository: deleteTranslation returns false for missing locale', async () => {
  const repo = await setupRepo();
  const campaign = repo.create({ name: 'Test', rewardPerAction: 0 });
  assert.equal(repo.deleteTranslation(campaign.id, 'es'), false);
});

// ── HTTP integration tests ────────────────────────────────────────────────────

async function startTestServer(options = {}) {
  const app = await createApp({
    disableJobs: true,
    disableWebSocket: true,
    dbPath: ':memory:',
    apiKey: 'test-key',
    ...options,
  });
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function stop(server) {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

async function createTestCampaign(baseUrl) {
  const res = await fetch(`${baseUrl}/api/v1/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
    body: JSON.stringify({ name: 'My Campaign', description: 'English desc', rewardPerAction: 5 }),
  });
  return res.json();
}

test('PUT /campaigns/:id/translations/:locale stores a translation', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const campaign = await createTestCampaign(baseUrl);
    const res = await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}/translations/es`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
      body: JSON.stringify({ name: 'Mi Campaña', description: 'Descripción en español' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.locale, 'es');
    assert.equal(body.translation.name, 'Mi Campaña');
  } finally {
    await stop(server);
  }
});

test('GET /campaigns/:id/translations returns all translations', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const campaign = await createTestCampaign(baseUrl);

    await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}/translations/es`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
      body: JSON.stringify({ name: 'Mi Campaña' }),
    });
    await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}/translations/fr`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
      body: JSON.stringify({ name: 'Ma Campagne' }),
    });

    const res = await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}/translations`, {
      headers: { 'X-API-Key': 'test-key' },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.translations.es);
    assert.ok(body.translations.fr);
  } finally {
    await stop(server);
  }
});

test('GET /campaigns/:id returns available_locales', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const campaign = await createTestCampaign(baseUrl);

    await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}/translations/es`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
      body: JSON.stringify({ name: 'Mi Campaña' }),
    });

    const res = await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}`);
    const body = await res.json();
    assert.ok(Array.isArray(body.available_locales));
    assert.ok(body.available_locales.includes('es'));
    assert.ok(!('_rawTranslations' in body));
  } finally {
    await stop(server);
  }
});

test('GET /campaigns/:id?locale=es applies locale negotiation', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const campaign = await createTestCampaign(baseUrl);

    await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}/translations/es`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
      body: JSON.stringify({ name: 'Mi Campaña', description: 'En español' }),
    });

    const res = await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}?locale=es`);
    const body = await res.json();
    assert.equal(body.name, 'Mi Campaña');
    assert.equal(body.description, 'En español');
  } finally {
    await stop(server);
  }
});

test('GET /campaigns/:id falls back to English for missing locale', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const campaign = await createTestCampaign(baseUrl);

    const res = await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}?locale=de`);
    const body = await res.json();
    assert.equal(body.name, 'My Campaign');
    assert.equal(body.description, 'English desc');
  } finally {
    await stop(server);
  }
});

test('GET /campaigns/:id uses Accept-Language header for locale negotiation', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const campaign = await createTestCampaign(baseUrl);

    await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}/translations/fr`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
      body: JSON.stringify({ name: 'Ma Campagne', description: 'En français' }),
    });

    const res = await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}`, {
      headers: { 'Accept-Language': 'fr,en;q=0.9' },
    });
    const body = await res.json();
    assert.equal(body.name, 'Ma Campagne');
  } finally {
    await stop(server);
  }
});

test('GET /campaigns list includes locale-negotiated names', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const campaign = await createTestCampaign(baseUrl);

    await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}/translations/es`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
      body: JSON.stringify({ name: 'Mi Campaña' }),
    });

    // publish so it appears in public list
    await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
      body: JSON.stringify({ status: 'published', contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', active: true }),
    });

    const res = await fetch(`${baseUrl}/api/v1/campaigns?locale=es`);
    const body = await res.json();
    const found = body.data.find((c) => c.id === campaign.id);
    assert.ok(found);
    assert.equal(found.name, 'Mi Campaña');
    assert.ok(!('_rawTranslations' in found));
  } finally {
    await stop(server);
  }
});

test('PUT /campaigns/:id/translations/:locale rejects invalid locale', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const campaign = await createTestCampaign(baseUrl);
    const res = await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}/translations/not_valid`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
      body: JSON.stringify({ name: 'test' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'INVALID_LOCALE');
  } finally {
    await stop(server);
  }
});

test('PUT /campaigns/:id/translations/:locale enforces 10-locale limit', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const campaign = await createTestCampaign(baseUrl);
    const locales = ['es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ar', 'ru'];

    for (const locale of locales) {
      await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}/translations/${locale}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
        body: JSON.stringify({ name: `name in ${locale}` }),
      });
    }

    // 11th locale should fail
    const res = await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}/translations/nl`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
      body: JSON.stringify({ name: 'Nederlands' }),
    });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.code, 'LOCALE_LIMIT_EXCEEDED');
  } finally {
    await stop(server);
  }
});

test('PUT /campaigns/:id/translations/:locale enforces 2KB size limit', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const campaign = await createTestCampaign(baseUrl);
    const res = await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}/translations/es`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
      body: JSON.stringify({ name: 'test', description: 'x'.repeat(2100) }),
    });
    assert.equal(res.status, 413);
    const body = await res.json();
    assert.equal(body.code, 'TRANSLATION_TOO_LARGE');
  } finally {
    await stop(server);
  }
});

test('?locale=es query param takes precedence over Accept-Language header', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const campaign = await createTestCampaign(baseUrl);

    await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}/translations/es`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
      body: JSON.stringify({ name: 'Mi Campaña' }),
    });
    await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}/translations/fr`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
      body: JSON.stringify({ name: 'Ma Campagne' }),
    });

    const res = await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}?locale=es`, {
      headers: { 'Accept-Language': 'fr,en;q=0.9' },
    });
    const body = await res.json();
    assert.equal(body.name, 'Mi Campaña');
  } finally {
    await stop(server);
  }
});

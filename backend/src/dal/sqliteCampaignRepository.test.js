import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { createSqliteCampaignRepository, computeCampaignStatus } from './sqliteCampaignRepository.js';

async function setupTestRepository(seed = []) {
  const db = new Database(':memory:');
  await runMigrations(db);
  return createSqliteCampaignRepository({ db, seed });
}

function seedCampaigns() {
  return [
    {
      name: 'Welcome Campaign',
      description: 'Rewards for onboarding',
      active: true,
      featured: true,
      rewardPerAction: 10,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      name: 'Builder Sprint',
      description: 'Dev tooling campaign',
      active: false,
      rewardPerAction: 25,
      createdAt: '2026-01-02T00:00:00.000Z',
    },
  ];
}

test('sqlite campaign repository lists, filters, and searches campaigns', async () => {
  const repository = await setupTestRepository(seedCampaigns());

  assert.equal(repository.list().length, 2);
  assert.equal(repository.list({ active: true }).length, 1);
  assert.equal(repository.list({ active: false }).length, 1);
  assert.equal(repository.list({ q: 'builder' }).length, 1);
});

test('sqlite campaign repository generates slug from name', async () => {
  const repository = await setupTestRepository();

  const created = repository.create({
    name: 'My Awesome Campaign!',
    description: 'Test',
    rewardPerAction: 10,
  });

  assert.equal(created.slug, 'my-awesome-campaign');
});

test('sqlite campaign repository allows explicit slug', async () => {
  const repository = await setupTestRepository();

  const created = repository.create({
    name: 'Test Campaign',
    slug: 'custom-slug',
    description: 'Test',
    rewardPerAction: 10,
  });

  assert.equal(created.slug, 'custom-slug');
});

test('sqlite campaign repository retrieves campaign by slug', async () => {
  const repository = await setupTestRepository();

  const created = repository.create({
    name: 'Slug Test',
    description: 'Test',
    rewardPerAction: 10,
  });

  const retrieved = repository.getBySlug(created.slug);
  assert.equal(retrieved.id, created.id);
  assert.equal(retrieved.name, 'Slug Test');
});

test('sqlite campaign repository rejects duplicate slugs', async () => {
  const repository = await setupTestRepository();

  repository.create({
    name: 'First Campaign',
    slug: 'duplicate-slug',
    description: 'Test',
    rewardPerAction: 10,
  });

  assert.throws(
    () => {
      repository.create({
        name: 'Second Campaign',
        slug: 'duplicate-slug',
        description: 'Test',
        rewardPerAction: 10,
      });
    },
    /UNIQUE constraint failed/,
  );
});

test('sqlite campaign repository creates, updates, and deletes campaigns', async () => {
  const repository = await setupTestRepository();

  const created = repository.create({
    name: 'Launch Quest',
    description: 'Initial launch rewards',
    rewardPerAction: 40,
  });

  assert.equal(created.name, 'Launch Quest');
  assert.equal(created.active, true);

  const updated = repository.update(created.id, {
    name: 'Launch Quest Updated',
    active: false,
  });

  assert.equal(updated.name, 'Launch Quest Updated');
  assert.equal(updated.active, false);

  assert.equal(repository.delete(created.id), true);
  assert.equal(repository.getById(created.id), undefined);
  assert.equal(repository.delete(created.id), false);
});

test('sqlite campaign repository handles featured flag', async () => {
  const repository = await setupTestRepository();

  const created = repository.create({
    name: 'Featured Quest',
    description: 'Hot rewards',
    featured: true,
    rewardPerAction: 100,
  });

  assert.equal(created.featured, true);

  const updated = repository.update(created.id, { featured: false });
  assert.equal(updated.featured, false);
});

test('computeCampaignStatus returns active when no dates are set', () => {
  assert.equal(computeCampaignStatus({ startDate: null, endDate: null }), 'active');
});

test('computeCampaignStatus returns upcoming when startDate is in the future', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  assert.equal(computeCampaignStatus({ startDate: future, endDate: null }), 'upcoming');
});

test('computeCampaignStatus returns ended when endDate is in the past', () => {
  const past = new Date(Date.now() - 86_400_000).toISOString();
  assert.equal(computeCampaignStatus({ startDate: null, endDate: past }), 'ended');
});

test('computeCampaignStatus returns active when within start and end date range', () => {
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();
  assert.equal(computeCampaignStatus({ startDate: past, endDate: future }), 'active');
});

test('computeCampaignStatus prioritises ended over upcoming', () => {
  // end_date already passed — campaign is ended regardless of start_date
  const past = new Date(Date.now() - 86_400_000).toISOString();
  assert.equal(computeCampaignStatus({ startDate: past, endDate: past }), 'ended');
});

test('campaign repository attaches computed status to returned campaigns', async () => {
  const repository = await setupTestRepository();

  const upcoming = repository.create({
    name: 'Future Campaign',
    rewardPerAction: 5,
    startDate: future,
  });
  assert.equal(upcoming.status, 'upcoming');
  assert.equal(upcoming.startDate, future);

  const ended = repository.create({
    name: 'Old Campaign',
    rewardPerAction: 5,
    endDate: past,
  });
  assert.equal(ended.status, 'ended');
  assert.equal(ended.endDate, past);

  const active = repository.create({
    name: 'Running Campaign',
    rewardPerAction: 5,
    startDate: past,
    endDate: future,
  });
  assert.equal(active.status, 'active');
});

test('campaign repository update can set and clear startDate/endDate', async () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const repository = await setupTestRepository();

  const created = repository.create({ name: 'Test', rewardPerAction: 1 });
  assert.equal(created.status, 'active');

  const withStart = repository.update(created.id, { startDate: future });
  assert.equal(withStart.status, 'upcoming');

  const cleared = repository.update(created.id, { startDate: null });
  assert.equal(cleared.status, 'active');
  assert.equal(cleared.startDate, null);
});

// #232 — featured flag and ordering
test('featured campaigns sort before non-featured campaigns', async () => {
  const repository = await setupTestRepository();

  repository.create({ name: 'Regular A', rewardPerAction: 1 });
  const featured = repository.create({ name: 'Featured One', rewardPerAction: 1, featured: true });
  repository.create({ name: 'Regular B', rewardPerAction: 1 });

  const results = repository.list();
  assert.equal(results[0].id, featured.id);
  assert.equal(results[0].featured, true);
  assert.equal(results[1].featured, false);
  assert.equal(results[2].featured, false);
});

test('update can set and unset featured flag', async () => {
  const repository = await setupTestRepository();

  const campaign = repository.create({ name: 'Promo', rewardPerAction: 5 });
  assert.equal(campaign.featured, false);

  const featured = repository.update(campaign.id, { featured: true });
  assert.equal(featured.featured, true);

  const unfeatured = repository.update(campaign.id, { featured: false });
  assert.equal(unfeatured.featured, false);
});

// #234 — hidden flag and moderation
test('hidden campaigns are excluded from public list', async () => {
  const repository = await setupTestRepository();

  repository.create({ name: 'Visible', rewardPerAction: 1 });
  const hidden = repository.create({ name: 'Hidden Spam', rewardPerAction: 1 });
  repository.update(hidden.id, { hidden: true, hiddenReason: 'spam' });

  const results = repository.list();
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Visible');
});

test('hidden campaigns are still accessible by id', async () => {
  const repository = await setupTestRepository();

  const campaign = repository.create({ name: 'Abusive Campaign', rewardPerAction: 1 });
  repository.update(campaign.id, { hidden: true, hiddenReason: 'abuse' });

  const fetched = repository.getById(campaign.id);
  assert.ok(fetched);
  assert.equal(fetched.hidden, true);
  assert.equal(fetched.hiddenReason, 'abuse');
});

test('update can set and clear hidden flag and reason', async () => {
  const repository = await setupTestRepository();

  const campaign = repository.create({ name: 'Test Mod', rewardPerAction: 1 });
  assert.equal(campaign.hidden, false);
  assert.equal(campaign.hiddenReason, null);

  const hidden = repository.update(campaign.id, { hidden: true, hiddenReason: 'spam' });
  assert.equal(hidden.hidden, true);
  assert.equal(hidden.hiddenReason, 'spam');

  const restored = repository.update(campaign.id, { hidden: false, hiddenReason: null });
  assert.equal(restored.hidden, false);
  assert.equal(restored.hiddenReason, null);
});

test('list includeHidden option exposes hidden campaigns', async () => {
  const repository = await setupTestRepository();

  repository.create({ name: 'Visible', rewardPerAction: 1 });
  const hidden = repository.create({ name: 'Hidden', rewardPerAction: 1 });
  repository.update(hidden.id, { hidden: true });

  assert.equal(repository.list().length, 1);
  assert.equal(repository.list({ includeHidden: true }).length, 2);
});

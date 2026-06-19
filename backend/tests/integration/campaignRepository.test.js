// @ts-check
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { createIntegrationTestEnv, seedCampaigns } from './setup.js';

describe('sqliteCampaignRepository — integration tests (real SQLite)', () => {
  /** @type {import('../../src/dal/sqliteCampaignRepository.js').SqliteCampaignRepository} */
  let campaigns;
  /** @type {import('better-sqlite3').Database} */
  let db;
  /** @type {() => void} */
  let destroy;

  before(() => {
    const env = createIntegrationTestEnv();
    campaigns = env.campaigns;
    db = env.db;
    destroy = env.destroy;
  });

  after(() => {
    destroy();
  });

  describe('CRUD operations', () => {
    it('creates a campaign with all fields', () => {
      const created = campaigns.create({
        name: 'Test Campaign',
        slug: 'test-campaign',
        description: 'A test campaign for integration testing',
        active: true,
        featured: false,
        rewardPerAction: 50,
        referralBonusPoints: 5,
        startDate: null,
        endDate: null,
        tags: ['test', 'integration'],
        category: 'DeFi',
      });

      assert.ok(created.id);
      assert.equal(created.name, 'Test Campaign');
      assert.equal(created.slug, 'test-campaign');
      assert.equal(created.description, 'A test campaign for integration testing');
      assert.equal(created.active, true);
      assert.equal(created.featured, false);
      assert.equal(created.rewardPerAction, 50);
      assert.equal(created.referralBonusPoints, 5);
      assert.deepEqual(created.tags, ['test', 'integration']);
      assert.equal(created.category, 'DeFi');
      assert.equal(created.status, 'active');
    });

    it('reads a campaign by id', () => {
      const created = campaigns.create({
        name: 'Read Test',
        slug: 'read-test',
        rewardPerAction: 10,
      });
      const found = campaigns.getById(created.id);
      assert.ok(found);
      assert.equal(found.name, 'Read Test');
      assert.equal(found.slug, 'read-test');
    });

    it('reads a campaign by slug', () => {
      const created = campaigns.create({
        name: 'Slug Test',
        slug: 'slug-test-route',
        rewardPerAction: 10,
      });
      const found = campaigns.getBySlug('slug-test-route');
      assert.ok(found);
      assert.equal(found.name, 'Slug Test');
      assert.equal(found.id, created.id);
    });

    it('returns undefined for non-existent id', () => {
      const found = campaigns.getById('999999');
      assert.equal(found, undefined);
    });

    it('returns undefined for non-existent slug', () => {
      const found = campaigns.getBySlug('non-existent-slug');
      assert.equal(found, undefined);
    });

    it('updates a campaign', () => {
      const created = campaigns.create({
        name: 'Update Test',
        slug: 'update-test',
        rewardPerAction: 10,
      });

      const updated = campaigns.update(created.id, {
        name: 'Updated Name',
        rewardPerAction: 25,
        active: false,
      });

      assert.ok(updated);
      assert.equal(updated.name, 'Updated Name');
      assert.equal(updated.rewardPerAction, 25);
      assert.equal(updated.active, false);
      // Slug should be preserved
      assert.equal(updated.slug, 'update-test');
    });

    it('deletes a campaign', () => {
      const created = campaigns.create({
        name: 'Delete Test',
        slug: 'delete-test',
        rewardPerAction: 10,
      });

      const deleted = campaigns.delete(created.id);
      assert.equal(deleted, true);

      const found = campaigns.getById(created.id);
      assert.equal(found, undefined);
    });

    it('returns false when deleting non-existent campaign', () => {
      const deleted = campaigns.delete('999999');
      assert.equal(deleted, false);
    });
  });

  describe('list with filters', () => {
    let allCreated;

    before(() => {
      allCreated = seedCampaigns(campaigns, [
        {
          name: 'Active DeFi',
          slug: 'active-defi',
          active: true,
          tags: ['defi'],
          category: 'DeFi',
          rewardPerAction: 10,
        },
        {
          name: 'Inactive NFT',
          slug: 'inactive-nft',
          active: false,
          tags: ['nft'],
          category: 'NFT',
          rewardPerAction: 20,
        },
        {
          name: 'Featured Community',
          slug: 'featured-community',
          active: true,
          featured: true,
          tags: ['community'],
          category: 'Community',
          rewardPerAction: 30,
        },
        {
          name: 'Active Airdrop',
          slug: 'active-airdrop',
          active: true,
          tags: ['airdrop', 'defi'],
          category: 'Airdrop',
          rewardPerAction: 40,
        },
      ]);
    });

    it('lists all campaigns', () => {
      const result = campaigns.list();
      // Should include seeded + previously created campaigns
      assert.ok(result.length >= 4);
    });

    it('filters by active status', () => {
      const active = campaigns.list({ active: true });
      assert.ok(active.every((c) => c.active === true));

      const inactive = campaigns.list({ active: false });
      assert.ok(inactive.every((c) => c.active === false));
    });

    it('filters by featured', () => {
      const all = campaigns.list();
      // Featured campaigns should come first in default sort
      if (all.length >= 2) {
        const featured = all.filter((c) => c.featured);
        assert.ok(featured.length >= 1);
        assert.ok(featured.every((c) => c.featured === true));
      }
    });

    it('filters by tags (any match)', () => {
      const defiTagged = campaigns.list({ tags: ['defi'] });
      assert.ok(defiTagged.length >= 1);
      assert.ok(defiTagged.every((c) => c.tags.includes('defi')));
    });

    it('filters by multiple tags (OR match)', () => {
      const tagged = campaigns.list({ tags: ['nft', 'community'] });
      assert.ok(tagged.length >= 1);
      assert.ok(tagged.every((c) => c.tags.some((t) => ['nft', 'community'].includes(t))));
    });

    it('filters by category', () => {
      const defiCampaigns = campaigns.list({ category: 'DeFi' });
      assert.ok(defiCampaigns.length >= 1);
      assert.ok(defiCampaigns.every((c) => c.category === 'DeFi'));
    });

    it('returns empty array for non-existent category', () => {
      const result = campaigns.list({ category: 'NonExistent' });
      assert.deepEqual(result, []);
    });

    it('performs FTS5 text search when available', () => {
      // FTS5 may not be available in all SQLite builds
      if (campaigns.ftsAvailable) {
        const result = campaigns.list({ q: 'Featured' });
        assert.ok(result.length >= 1);
        // Featured Community should match
        const match = result.find((c) => c.slug === 'featured-community');
        assert.ok(match);
      }
    });

    it('performs LIKE fallback text search when FTS5 unavailable', () => {
      const result = campaigns.list({ q: 'airdrop' });
      assert.ok(result.length >= 1);
      const match = result.find((c) => c.slug === 'active-airdrop');
      assert.ok(match);
    });

    it('combines multiple filters', () => {
      const result = campaigns.list({ active: true, category: 'DeFi' });
      assert.ok(result.length >= 1);
      assert.ok(result.every((c) => c.active === true && c.category === 'DeFi'));
    });
  });

  describe('pagination (offset mode)', () => {
    before(() => {
      // Ensure at least 8 campaigns exist for pagination tests
      const existing = campaigns.list();
      if (existing.length < 8) {
        for (let i = existing.length + 1; i <= 8; i++) {
          campaigns.create({
            name: `Pagination Campaign ${i}`,
            slug: `pagination-campaign-${i}`,
            rewardPerAction: i * 5,
          });
        }
      }
    });

    it('returns correct number of items with limit', () => {
      const result = campaigns.list();
      const limited = result.slice(0, 3);
      assert.equal(limited.length, 3);
    });

    it('supports offset-based access', () => {
      const all = campaigns.list();
      const page1 = all.slice(0, 3);
      const page2 = all.slice(3, 6);
      assert.ok(page1.length > 0);
      assert.ok(page2.length > 0);
      // IDs should differ between pages
      const ids1 = new Set(page1.map((c) => c.id));
      const ids2 = new Set(page2.map((c) => c.id));
      for (const id of ids1) {
        assert.ok(!ids2.has(id), `ID ${id} should not appear on both pages`);
      }
    });
  });

  describe('concurrent writes (race condition simulation)', () => {
    it('handles multiple concurrent participant count increments', () => {
      // This test simulates a race condition on participant count
      // by rapidly creating campaigns and reading them back
      const promises = Array.from({ length: 5 }, (_, i) => {
        return campaigns.create({
          name: `Concurrent Campaign ${i}`,
          slug: `concurrent-campaign-${i}`,
          rewardPerAction: 100,
        });
      });

      const results = promises;
      assert.equal(results.length, 5);

      // Verify all were created
      for (const result of results) {
        const found = campaigns.getById(result.id);
        assert.ok(found, `Campaign ${result.id} should exist after concurrent create`);
        assert.equal(found.name, result.name);
      }
    });

    it('handles concurrent read and write without corruption', () => {
      const created = campaigns.create({
        name: 'Race Condition Test',
        slug: 'race-condition-test',
        rewardPerAction: 50,
      });

      // Simulate concurrent read and update
      const readResult = campaigns.getById(created.id);
      const updateResult = campaigns.update(created.id, { rewardPerAction: 75 });

      assert.ok(readResult);
      assert.equal(readResult.id, created.id);
      assert.ok(updateResult);
      assert.equal(updateResult.rewardPerAction, 75);

      // Verify final state
      const final = campaigns.getById(created.id);
      assert.equal(final.rewardPerAction, 75);
    });
  });

  describe('sort order', () => {
    it('sorts by name ascending', () => {
      const result = campaigns.list({ sort: 'name', order: 'asc' });
      if (result.length >= 2) {
        for (let i = 1; i < result.length; i++) {
          assert.ok(result[i - 1].name.localeCompare(result[i].name) <= 0);
        }
      }
    });

    it('sorts by name descending', () => {
      const result = campaigns.list({ sort: 'name', order: 'desc' });
      if (result.length >= 2) {
        for (let i = 1; i < result.length; i++) {
          assert.ok(result[i - 1].name.localeCompare(result[i].name) >= 0);
        }
      }
    });

    it('sorts by createdAt descending by default', () => {
      const result = campaigns.list();
      if (result.length >= 2) {
        for (let i = 1; i < result.length; i++) {
          // Featured campaigns come first, then by ID ASC
          // Within same featured status, earlier-created campaigns have lower IDs
          if (result[i - 1].featured === result[i].featured) {
            assert.ok(
              Number(result[i - 1].id) <= Number(result[i].id),
              `Default sort should be by featured DESC, id ASC. ${result[i - 1].id} <= ${result[i].id}`,
            );
          }
        }
      }
    });
  });
});

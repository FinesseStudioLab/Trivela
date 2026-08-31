// @ts-check
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createSqliteVariantRepository } from '../dal/sqliteVariantRepository.js';
import { createVariantService } from './variantService.js';
import { up as up010 } from '../db/migrations/010_campaign_variants.js';

describe('variantService', () => {
  let db;
  let variantRepo;
  let variantService;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');

    // Set up campaigns table (minimal schema for testing)
    db.exec(`
      CREATE TABLE campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      
      INSERT INTO campaigns (id, name, slug, description, created_at, updated_at)
      VALUES (1, 'Test Campaign', 'test-campaign', 'Test Description', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z');
    `);

    // Apply variant migration
    up010(db);

    // Create repositories and service
    variantRepo = createSqliteVariantRepository({ db });
    variantService = createVariantService({ variantRepo });
  });

  describe('assignVariant', () => {
    it('should assign a user to a variant based on traffic weights', async () => {
      // Create two variants with equal weight
      variantRepo.createVariant({
        campaignId: '1',
        variantKey: 'control',
        name: 'Control',
        trafficWeight: 50,
        isControl: true,
      });

      variantRepo.createVariant({
        campaignId: '1',
        variantKey: 'variant_a',
        name: 'Variant A',
        trafficWeight: 50,
      });

      // Assign user
      const assignment = await variantService.assignVariant('1', 'user123');

      assert.ok(assignment.variantId);
      assert.ok(assignment.variantKey);
      assert.strictEqual(assignment.isNewAssignment, true);
      assert.ok(['control', 'variant_a'].includes(assignment.variantKey));
    });

    it('should return existing sticky assignment', async () => {
      // Create variant
      const variant = variantRepo.createVariant({
        campaignId: '1',
        variantKey: 'control',
        name: 'Control',
        trafficWeight: 100,
        isControl: true,
      });

      // First assignment
      const first = await variantService.assignVariant('1', 'user123', true);
      assert.strictEqual(first.isNewAssignment, true);
      assert.strictEqual(first.variantKey, 'control');

      // Second assignment should return the same variant
      const second = await variantService.assignVariant('1', 'user123', true);
      assert.strictEqual(second.isNewAssignment, false);
      assert.strictEqual(second.variantKey, 'control');
      assert.strictEqual(second.variantId, first.variantId);
    });

    it('should throw error when no active variants exist', async () => {
      await assert.rejects(
        variantService.assignVariant('1', 'user123'),
        /No active variants found/,
      );
    });

    it('should respect traffic weights for distribution', async () => {
      // Create variants with 80/20 split
      variantRepo.createVariant({
        campaignId: '1',
        variantKey: 'control',
        name: 'Control',
        trafficWeight: 80,
        isControl: true,
      });

      variantRepo.createVariant({
        campaignId: '1',
        variantKey: 'variant_a',
        name: 'Variant A',
        trafficWeight: 20,
      });

      // Assign many users and check distribution
      const assignments = {};
      for (let i = 0; i < 100; i++) {
        const assignment = await variantService.assignVariant('1', `user${i}`);
        assignments[assignment.variantKey] = (assignments[assignment.variantKey] || 0) + 1;
      }

      // Distribution should roughly match weights (allowing for variance)
      assert.ok(assignments.control > 60); // Should be around 80
      assert.ok(assignments.variant_a < 40); // Should be around 20
    });
  });

  describe('getUserVariant', () => {
    it('should return null if user has no assignment', () => {
      const result = variantService.getUserVariant('1', 'nonexistent');
      assert.strictEqual(result, null);
    });

    it('should return user variant assignment', async () => {
      // Create variant
      variantRepo.createVariant({
        campaignId: '1',
        variantKey: 'control',
        name: 'Control',
        trafficWeight: 100,
        isControl: true,
      });

      // Assign user
      await variantService.assignVariant('1', 'user123');

      // Get assignment
      const result = variantService.getUserVariant('1', 'user123');
      assert.ok(result);
      assert.strictEqual(result.variantKey, 'control');
    });
  });

  describe('trackResult', () => {
    it('should record a result for assigned user', async () => {
      // Create variant and assign user
      variantRepo.createVariant({
        campaignId: '1',
        variantKey: 'control',
        name: 'Control',
        trafficWeight: 100,
        isControl: true,
      });

      await variantService.assignVariant('1', 'user123');

      // Track result
      const result = await variantService.trackResult({
        campaignId: '1',
        userId: 'user123',
        metricName: 'conversion',
        metricValue: 1,
      });

      assert.ok(result);
      assert.strictEqual(result.metricName, 'conversion');
      assert.strictEqual(result.metricValue, 1);
      assert.strictEqual(result.userId, 'user123');
    });

    it('should throw error for unassigned user', async () => {
      await assert.rejects(
        variantService.trackResult({
          campaignId: '1',
          userId: 'unassigned',
          metricName: 'conversion',
          metricValue: 1,
        }),
        /not assigned to any variant/,
      );
    });
  });

  describe('getExperimentResults', () => {
    it('should return comprehensive experiment results', async () => {
      // Create variants
      const control = variantRepo.createVariant({
        campaignId: '1',
        variantKey: 'control',
        name: 'Control',
        trafficWeight: 50,
        isControl: true,
      });

      const variantA = variantRepo.createVariant({
        campaignId: '1',
        variantKey: 'variant_a',
        name: 'Variant A',
        trafficWeight: 50,
      });

      // Create assignments
      variantRepo.assignUserToVariant({
        campaignId: '1',
        variantId: control.id,
        userId: 'user1',
      });

      variantRepo.assignUserToVariant({
        campaignId: '1',
        variantId: variantA.id,
        userId: 'user2',
      });

      // Record results
      variantRepo.recordResult({
        campaignId: '1',
        variantId: control.id,
        metricName: 'conversion',
        metricValue: 0.5,
        userId: 'user1',
      });

      variantRepo.recordResult({
        campaignId: '1',
        variantId: variantA.id,
        metricName: 'conversion',
        metricValue: 0.8,
        userId: 'user2',
      });

      // Get results
      const results = variantService.getExperimentResults('1', 'conversion');

      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].variantKey, 'control');
      assert.strictEqual(results[0].sampleCount, 1);
      assert.strictEqual(results[0].mean, 0.5);
      assert.strictEqual(results[0].assignmentCount, 1);

      assert.strictEqual(results[1].variantKey, 'variant_a');
      assert.strictEqual(results[1].sampleCount, 1);
      assert.strictEqual(results[1].mean, 0.8);
      assert.strictEqual(results[1].assignmentCount, 1);
    });
  });

  describe('calculateSignificance', () => {
    it('should calculate significance for variant comparison', () => {
      const control = {
        sampleCount: 100,
        mean: 0.2, // 20% conversion
      };

      const variant = {
        sampleCount: 100,
        mean: 0.25, // 25% conversion
      };

      const result = variantService.calculateSignificance(control, variant);

      assert.ok(result.pValue !== undefined);
      assert.ok(typeof result.isSignificant === 'boolean');
      assert.ok(result.improvement !== undefined);
      assert.ok(result.zScore !== undefined);
      assert.ok(Math.abs(result.improvement - 25) < 1); // ~25% improvement
    });

    it('should return non-significant for zero samples', () => {
      const control = { sampleCount: 0, mean: 0 };
      const variant = { sampleCount: 100, mean: 0.5 };

      const result = variantService.calculateSignificance(control, variant);

      assert.strictEqual(result.isSignificant, false);
      assert.strictEqual(result.pValue, 1);
    });
  });

  describe('validateTrafficWeights', () => {
    it('should pass validation for valid weights', () => {
      const variants = [{ trafficWeight: 50 }, { trafficWeight: 30 }, { trafficWeight: 20 }];

      assert.doesNotThrow(() => variantService.validateTrafficWeights(variants));
    });

    it('should throw error if weights exceed 100%', () => {
      const variants = [{ trafficWeight: 60 }, { trafficWeight: 60 }];

      assert.throws(() => variantService.validateTrafficWeights(variants), /exceeds 100%/);
    });

    it('should throw error for negative weights', () => {
      const variants = [{ trafficWeight: -10 }];

      assert.throws(
        () => variantService.validateTrafficWeights(variants),
        /must be between 0 and 100/,
      );
    });

    it('should throw error for weights over 100', () => {
      const variants = [{ trafficWeight: 150 }];

      assert.throws(
        () => variantService.validateTrafficWeights(variants),
        /must be between 0 and 100/,
      );
    });
  });
});

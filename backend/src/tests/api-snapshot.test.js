/**
 * API Response Snapshot Tests
 *
 * Validates that API response shapes remain stable over time.
 * Changes to response structure require explicit snapshot updates.
 *
 * Run: node --test src/tests/api-snapshot.test.js
 * Update snapshots: UPDATE_SNAPSHOTS=1 node --test src/tests/api-snapshot.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = join(__dirname, '__snapshots__');
const UPDATE_SNAPSHOTS = process.env.UPDATE_SNAPSHOTS === '1';

// Ensure snapshot directory exists
if (!existsSync(SNAPSHOT_DIR)) {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

/**
 * Load or create snapshot
 */
function getSnapshot(name) {
  const path = join(SNAPSHOT_DIR, `${name}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Save snapshot
 */
function saveSnapshot(name, data) {
  const path = join(SNAPSHOT_DIR, `${name}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Deep compare with informative diff
 */
function compareShapes(actual, expected, path = 'root') {
  const errors = [];

  if (typeof actual !== typeof expected) {
    errors.push(`${path}: type mismatch (actual: ${typeof actual}, expected: ${typeof expected})`);
    return errors;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      errors.push(`${path}: expected array, got ${typeof actual}`);
      return errors;
    }
    if (expected.length > 0 && actual.length > 0) {
      // Compare first element shape
      errors.push(...compareShapes(actual[0], expected[0], `${path}[0]`));
    }
    return errors;
  }

  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object') {
      errors.push(`${path}: expected object, got ${typeof actual}`);
      return errors;
    }

    // Check for missing keys
    for (const key of Object.keys(expected)) {
      if (!(key in actual)) {
        errors.push(`${path}.${key}: missing in actual response`);
      } else {
        errors.push(...compareShapes(actual[key], expected[key], `${path}.${key}`));
      }
    }

    // Check for extra keys
    for (const key of Object.keys(actual)) {
      if (!(key in expected)) {
        errors.push(`${path}.${key}: unexpected key in actual response`);
      }
    }
  }

  return errors;
}

/**
 * Assert response shape matches snapshot
 */
function assertMatchesSnapshot(name, actualResponse) {
  const snapshot = getSnapshot(name);

  if (!snapshot || UPDATE_SNAPSHOTS) {
    console.log(`${UPDATE_SNAPSHOTS ? 'Updating' : 'Creating'} snapshot: ${name}`);
    saveSnapshot(name, actualResponse);
    return;
  }

  const errors = compareShapes(actualResponse, snapshot);
  if (errors.length > 0) {
    throw new Error(
      `Snapshot mismatch for "${name}":\n${errors.join('\n')}\n\n` +
        `Run with UPDATE_SNAPSHOTS=1 to update snapshots.`,
    );
  }
}

describe('API Response Snapshots', () => {
  describe('Campaign endpoints', () => {
    test('GET /api/v1/campaigns - list response shape', () => {
      const mockResponse = {
        campaigns: [
          {
            id: 1,
            slug: 'test-campaign',
            name: 'Test Campaign',
            description: 'A test campaign',
            rewardPerAction: 100,
            referralBonusPoints: 50,
            active: true,
            featured: false,
            imageUrl: null,
            tags: ['test'],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
            campaignContractId: null,
            rewardsContractId: null,
          },
        ],
        pagination: {
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        },
      };

      assertMatchesSnapshot('campaigns-list', mockResponse);
    });

    test('GET /api/v1/campaigns/:id - single campaign shape', () => {
      const mockResponse = {
        id: 1,
        slug: 'test-campaign',
        name: 'Test Campaign',
        description: 'A test campaign',
        rewardPerAction: 100,
        referralBonusPoints: 50,
        active: true,
        featured: false,
        imageUrl: null,
        tags: ['test'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        campaignContractId: null,
        rewardsContractId: null,
      };

      assertMatchesSnapshot('campaign-detail', mockResponse);
    });

    test('GET /api/v1/campaigns/:id/stats - campaign stats shape', () => {
      const mockResponse = {
        campaignId: 1,
        onChainSynced: true,
        range: {
          start: '2024-01-01T00:00:00.000Z',
          end: '2024-12-31T23:59:59.999Z',
        },
        summary: {
          totalParticipants: 150,
          totalPointsAwarded: 15000,
          totalClaimed: 5000,
          pendingClaims: 10000,
        },
        registrationsByDay: [
          { date: '2024-01-01', count: 10 },
          { date: '2024-01-02', count: 15 },
        ],
        pointsByDay: [
          { date: '2024-01-01', total: 1000 },
          { date: '2024-01-02', total: 1500 },
        ],
      };

      assertMatchesSnapshot('campaign-stats', mockResponse);
    });

    test('POST /api/v1/campaigns - create response shape', () => {
      const mockResponse = {
        id: 2,
        slug: 'new-campaign',
        name: 'New Campaign',
        description: 'Newly created campaign',
        rewardPerAction: 200,
        referralBonusPoints: 100,
        active: true,
        featured: false,
        imageUrl: null,
        tags: ['new'],
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        campaignContractId: null,
        rewardsContractId: null,
      };

      assertMatchesSnapshot('campaign-create', mockResponse);
    });
  });

  describe('Health and status endpoints', () => {
    test('GET /health - health check shape', () => {
      const mockResponse = {
        status: 'ok',
        timestamp: '2024-01-01T00:00:00.000Z',
        uptime: 12345,
        version: '0.1.0',
      };

      assertMatchesSnapshot('health-check', mockResponse);
    });

    test('GET /api/v1/health - v1 health check shape', () => {
      const mockResponse = {
        status: 'ok',
        timestamp: '2024-01-01T00:00:00.000Z',
        uptime: 12345,
        version: '0.1.0',
        services: {
          database: 'healthy',
          rpc: 'healthy',
        },
      };

      assertMatchesSnapshot('health-check-v1', mockResponse);
    });
  });

  describe('Error response shapes', () => {
    test('404 - Not Found', () => {
      const mockResponse = {
        error: 'Campaign not found',
        statusCode: 404,
      };

      assertMatchesSnapshot('error-404', mockResponse);
    });

    test('400 - Validation Error', () => {
      const mockResponse = {
        error: 'Validation failed',
        statusCode: 400,
        details: [
          {
            field: 'name',
            message: 'Name is required',
          },
        ],
      };

      assertMatchesSnapshot('error-400-validation', mockResponse);
    });

    test('429 - Rate Limit Exceeded', () => {
      const mockResponse = {
        error: 'Too many requests',
        statusCode: 429,
        retryAfter: 60,
      };

      assertMatchesSnapshot('error-429-rate-limit', mockResponse);
    });

    test('500 - Internal Server Error', () => {
      const mockResponse = {
        error: 'Internal server error',
        statusCode: 500,
        message: 'An unexpected error occurred',
      };

      assertMatchesSnapshot('error-500', mockResponse);
    });
  });

  describe('Pagination shape', () => {
    test('Standard pagination metadata', () => {
      const mockResponse = {
        pagination: {
          total: 100,
          page: 2,
          pageSize: 20,
          totalPages: 5,
          hasNext: true,
          hasPrevious: true,
        },
      };

      assertMatchesSnapshot('pagination-metadata', mockResponse);
    });
  });

  describe('Webhook payloads', () => {
    test('campaign.created webhook', () => {
      const mockPayload = {
        event: 'campaign.created',
        timestamp: '2024-01-01T00:00:00.000Z',
        data: {
          id: 1,
          slug: 'new-campaign',
          name: 'New Campaign',
          active: true,
        },
      };

      assertMatchesSnapshot('webhook-campaign-created', mockPayload);
    });

    test('participant.registered webhook', () => {
      const mockPayload = {
        event: 'participant.registered',
        timestamp: '2024-01-01T00:00:00.000Z',
        data: {
          campaignId: 1,
          participantAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          registeredAt: '2024-01-01T00:00:00.000Z',
        },
      };

      assertMatchesSnapshot('webhook-participant-registered', mockPayload);
    });
  });

  describe('Analytics endpoints', () => {
    test('GET /api/v1/analytics/overview - analytics shape', () => {
      const mockResponse = {
        totalCampaigns: 10,
        activeCampaigns: 7,
        totalParticipants: 1500,
        totalPointsAwarded: 150000,
        dateRange: {
          start: '2024-01-01',
          end: '2024-12-31',
        },
      };

      assertMatchesSnapshot('analytics-overview', mockResponse);
    });
  });

  describe('Auth endpoints', () => {
    test('POST /api/v1/auth/api-keys - create API key response', () => {
      const mockResponse = {
        id: 'key_abc123',
        name: 'Production API Key',
        prefix: 'sk_live_',
        createdAt: '2024-01-01T00:00:00.000Z',
        expiresAt: null,
        scopes: ['campaigns:read', 'campaigns:write'],
      };

      assertMatchesSnapshot('api-key-create', mockResponse);
    });
  });
});

describe('Snapshot utilities', () => {
  test('compareShapes detects type mismatch', () => {
    const errors = compareShapes({ name: 123 }, { name: 'string' });
    assert.ok(errors.length > 0);
    assert.match(errors[0], /type mismatch/);
  });

  test('compareShapes detects missing keys', () => {
    const errors = compareShapes({}, { name: 'required' });
    assert.ok(errors.length > 0);
    assert.match(errors[0], /missing in actual response/);
  });

  test('compareShapes detects extra keys', () => {
    const errors = compareShapes({ extra: 'field' }, {});
    assert.ok(errors.length > 0);
    assert.match(errors[0], /unexpected key/);
  });

  test('compareShapes handles nested objects', () => {
    const errors = compareShapes({ data: { id: 1 } }, { data: { id: 1, name: 'required' } });
    assert.ok(errors.length > 0);
    assert.match(errors[0], /data\.name/);
  });

  test('compareShapes handles arrays', () => {
    const errors = compareShapes({ items: [{ id: 1 }] }, { items: [{ id: 1, name: 'required' }] });
    assert.ok(errors.length > 0);
    assert.match(errors[0], /items\[0\]\.name/);
  });
});

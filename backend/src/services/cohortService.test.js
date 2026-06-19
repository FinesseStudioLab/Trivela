// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { createSqliteCohortRepository } from '../dal/sqliteCohortRepository.js';
import { createCohortService } from './cohortService.js';

/**
 * Create test database and repository
 */
async function makeTestCohort() {
  const db = new Database(':memory:');
  await runMigrations(db);

  // Create test campaign
  db.prepare(
    `INSERT INTO campaigns (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(1, 'Test Campaign', 'test-campaign', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z');

  const cohortRepo = createSqliteCohortRepository({ db });
  const cohortService = createCohortService({ cohortRepo });

  return { db, cohortRepo, cohortService };
}

test('cohortService - deterministic fixture test with hand-computed values', async () => {
  const { cohortService } = await makeTestCohort();

  // Week 1 (2024-W01): 3 users register
  cohortService.recordRegistration(1, 'USER_A', '2024-01-01T10:00:00Z');
  cohortService.recordRegistration(1, 'USER_B', '2024-01-03T14:00:00Z');
  cohortService.recordRegistration(1, 'USER_C', '2024-01-05T18:00:00Z');

  // Week 2 (2024-W02): 2 users register
  cohortService.recordRegistration(1, 'USER_D', '2024-01-08T09:00:00Z');
  cohortService.recordRegistration(1, 'USER_E', '2024-01-10T16:00:00Z');

  // USER_A claims in week 0 (same week as registration)
  cohortService.recordClaim(1, 'USER_A', '2024-01-02T12:00:00Z');

  // USER_B claims in week 1 (1 week after registration)
  cohortService.recordClaim(1, 'USER_B', '2024-01-09T10:00:00Z');

  // USER_C claims in week 0
  cohortService.recordClaim(1, 'USER_C', '2024-01-06T08:00:00Z');

  // USER_D claims in week 0
  cohortService.recordClaim(1, 'USER_D', '2024-01-08T15:00:00Z');

  // USER_A claims again in week 2 (2 weeks after registration)
  cohortService.recordClaim(1, 'USER_A', '2024-01-15T11:00:00Z');

  // Compute cohorts
  const analysis = await cohortService.getCohortAnalysis(1, 'week', 'claimed');

  assert.equal(analysis.length, 2, 'Should have 2 cohorts');

  // Week 1 cohort (2024-W01)
  const cohort1 = analysis.find((c) => c.cohortPeriod === '2024-W01');
  assert.ok(cohort1, 'Week 1 cohort should exist');
  assert.equal(cohort1.cohortSize, 3, 'Week 1 cohort should have 3 users');

  // Week 1 retention:
  // - Offset 0 (same week): USER_A, USER_C claimed = 2 users (66.67%)
  // - Offset 1 (1 week later): USER_B claimed = 1 user (33.33%)
  // - Offset 2 (2 weeks later): USER_A claimed = 1 user (33.33%)
  const week1Retention = cohort1.retention;
  assert.ok(week1Retention.length >= 1, 'Week 1 should have retention data');

  const week1Offset0 = week1Retention.find((r) => r.offset === 0);
  assert.ok(week1Offset0, 'Week 1 offset 0 should exist');
  assert.equal(week1Offset0.userCount, 2, 'Week 1 offset 0 should have 2 users');
  assert.equal(week1Offset0.retentionRate, 66.67, 'Week 1 offset 0 retention should be 66.67%');

  const week1Offset1 = week1Retention.find((r) => r.offset === 1);
  assert.ok(week1Offset1, 'Week 1 offset 1 should exist');
  assert.equal(week1Offset1.userCount, 1, 'Week 1 offset 1 should have 1 user');
  assert.equal(week1Offset1.retentionRate, 33.33, 'Week 1 offset 1 retention should be 33.33%');

  const week1Offset2 = week1Retention.find((r) => r.offset === 2);
  assert.ok(week1Offset2, 'Week 1 offset 2 should exist');
  assert.equal(week1Offset2.userCount, 1, 'Week 1 offset 2 should have 1 user');
  assert.equal(week1Offset2.retentionRate, 33.33, 'Week 1 offset 2 retention should be 33.33%');

  // Week 2 cohort (2024-W02)
  const cohort2 = analysis.find((c) => c.cohortPeriod === '2024-W02');
  assert.ok(cohort2, 'Week 2 cohort should exist');
  assert.equal(cohort2.cohortSize, 2, 'Week 2 cohort should have 2 users');

  // Week 2 retention:
  // - Offset 0: USER_D claimed = 1 user (50%)
  const week2Retention = cohort2.retention;
  const week2Offset0 = week2Retention.find((r) => r.offset === 0);
  assert.ok(week2Offset0, 'Week 2 offset 0 should exist');
  assert.equal(week2Offset0.userCount, 1, 'Week 2 offset 0 should have 1 user');
  assert.equal(week2Offset0.retentionRate, 50, 'Week 2 offset 0 retention should be 50%');
});

test('cohortService - day granularity', async () => {
  const { cohortService } = await makeTestCohort();

  // Day 1: 2 users register
  cohortService.recordRegistration(1, 'USER_A', '2024-01-01T10:00:00Z');
  cohortService.recordRegistration(1, 'USER_B', '2024-01-01T14:00:00Z');

  // Day 2: 1 user registers
  cohortService.recordRegistration(1, 'USER_C', '2024-01-02T10:00:00Z');

  // USER_A claims on day 0 and day 1
  cohortService.recordClaim(1, 'USER_A', '2024-01-01T12:00:00Z');
  cohortService.recordClaim(1, 'USER_A', '2024-01-02T12:00:00Z');

  // USER_B claims on day 1
  cohortService.recordClaim(1, 'USER_B', '2024-01-02T15:00:00Z');

  const analysis = await cohortService.getCohortAnalysis(1, 'day', 'claimed');

  assert.equal(analysis.length, 2, 'Should have 2 daily cohorts');

  const day1Cohort = analysis.find((c) => c.cohortPeriod === '2024-01-01');
  assert.ok(day1Cohort, 'Day 1 cohort should exist');
  assert.equal(day1Cohort.cohortSize, 2, 'Day 1 cohort should have 2 users');

  const day1Offset0 = day1Cohort.retention.find((r) => r.offset === 0);
  assert.equal(day1Offset0?.userCount, 1, 'Day 1 offset 0 should have 1 user');

  const day1Offset1 = day1Cohort.retention.find((r) => r.offset === 1);
  assert.equal(day1Offset1?.userCount, 2, 'Day 1 offset 1 should have 2 users');
});

test('cohortService - month granularity', async () => {
  const { cohortService } = await makeTestCohort();

  // January: 2 users
  cohortService.recordRegistration(1, 'USER_A', '2024-01-15T10:00:00Z');
  cohortService.recordRegistration(1, 'USER_B', '2024-01-20T14:00:00Z');

  // February: 1 user
  cohortService.recordRegistration(1, 'USER_C', '2024-02-05T10:00:00Z');

  // USER_A claims in January (month 0) and February (month 1)
  cohortService.recordClaim(1, 'USER_A', '2024-01-16T12:00:00Z');
  cohortService.recordClaim(1, 'USER_A', '2024-02-10T12:00:00Z');

  // USER_B claims in February (month 1)
  cohortService.recordClaim(1, 'USER_B', '2024-02-12T15:00:00Z');

  const analysis = await cohortService.getCohortAnalysis(1, 'month', 'claimed');

  assert.equal(analysis.length, 2, 'Should have 2 monthly cohorts');

  const janCohort = analysis.find((c) => c.cohortPeriod === '2024-01');
  assert.ok(janCohort, 'January cohort should exist');
  assert.equal(janCohort.cohortSize, 2, 'January cohort should have 2 users');

  const janOffset0 = janCohort.retention.find((r) => r.offset === 0);
  assert.equal(janOffset0?.userCount, 1, 'January offset 0 should have 1 user');

  const janOffset1 = janCohort.retention.find((r) => r.offset === 1);
  assert.equal(janOffset1?.userCount, 2, 'January offset 1 should have 2 users');
  assert.equal(janOffset1?.retentionRate, 100, 'January offset 1 retention should be 100%');
});

test('cohortService - active metric type', async () => {
  const { cohortService } = await makeTestCohort();

  cohortService.recordRegistration(1, 'USER_A', '2024-01-01T10:00:00Z');
  cohortService.recordRegistration(1, 'USER_B', '2024-01-01T14:00:00Z');

  // USER_A is active in week 0
  cohortService.recordActive(1, 'USER_A', '2024-01-02T12:00:00Z');

  // Both users are active in week 1
  cohortService.recordActive(1, 'USER_A', '2024-01-08T12:00:00Z');
  cohortService.recordActive(1, 'USER_B', '2024-01-09T15:00:00Z');

  const analysis = await cohortService.getCohortAnalysis(1, 'week', 'active');

  const cohort = analysis[0];
  assert.equal(cohort.cohortSize, 2, 'Cohort should have 2 users');

  const offset0 = cohort.retention.find((r) => r.offset === 0);
  assert.equal(offset0?.userCount, 1, 'Week 0 should have 1 active user');

  const offset1 = cohort.retention.find((r) => r.offset === 1);
  assert.equal(offset1?.userCount, 2, 'Week 1 should have 2 active users');
  assert.equal(offset1?.retentionRate, 100, 'Week 1 retention should be 100%');
});

test('cohortService - getRetentionCurve for specific cohort', async () => {
  const { cohortService } = await makeTestCohort();

  cohortService.recordRegistration(1, 'USER_A', '2024-01-01T10:00:00Z');
  cohortService.recordRegistration(1, 'USER_B', '2024-01-01T14:00:00Z');

  cohortService.recordClaim(1, 'USER_A', '2024-01-02T12:00:00Z');
  cohortService.recordClaim(1, 'USER_B', '2024-01-09T15:00:00Z');

  // Force computation first
  await cohortService.computeCohorts(1, 'week', 'claimed');

  const curve = await cohortService.getRetentionCurve(1, '2024-W01', 'week', 'claimed');

  assert.equal(curve.cohortPeriod, '2024-W01');
  assert.equal(curve.cohortSize, 2);
  assert.equal(curve.retention.length, 2);
});

test('cohortService - recompute clears cache', async () => {
  const { cohortService, cohortRepo } = await makeTestCohort();

  cohortService.recordRegistration(1, 'USER_A', '2024-01-01T10:00:00Z');
  cohortService.recordClaim(1, 'USER_A', '2024-01-02T12:00:00Z');

  // First computation
  await cohortService.getCohortAnalysis(1, 'week', 'claimed');

  // Add more data
  cohortService.recordRegistration(1, 'USER_B', '2024-01-03T10:00:00Z');
  cohortService.recordClaim(1, 'USER_B', '2024-01-04T12:00:00Z');

  // Recompute
  const analysis = await cohortService.getCohortAnalysis(1, 'week', 'claimed', { recompute: true });

  const cohort = analysis[0];
  assert.equal(cohort.cohortSize, 2, 'Cohort should now have 2 users after recompute');
});

test('cohortService - empty cohort handling', async () => {
  const { cohortService } = await makeTestCohort();

  const analysis = await cohortService.getCohortAnalysis(1, 'week', 'claimed');

  assert.equal(analysis.length, 0, 'Should have no cohorts when no data exists');
});

test('cohortService - throws error for non-existent cohort', async () => {
  const { cohortService } = await makeTestCohort();

  await assert.rejects(
    async () => {
      await cohortService.getRetentionCurve(1, '2024-W01', 'week', 'claimed');
    },
    /Cohort not found/,
    'Should throw error for non-existent cohort',
  );
});

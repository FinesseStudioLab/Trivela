import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { createEmailService } from '../services/emailService.js';
import { createWeeklyDigestJob } from './weeklyDigestJob.js';
import { createSqliteCampaignRepository } from '../dal/sqliteCampaignRepository.js';
import { createSqliteReferralRepository } from '../dal/sqliteReferralRepository.js';

function silentLogger() {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
}

async function setup() {
  const db = new Database(':memory:');
  await runMigrations(db);
  return {
    db,
    campaignRepository: createSqliteCampaignRepository({ db }),
    referralRepository: createSqliteReferralRepository({ db }),
  };
}

function makeMailer() {
  /** @type {{ to: string, subject: string, text: string }[]} */
  const sent = [];
  return {
    sent,
    emailService: createEmailService({
      transport: async (msg) => {
        sent.push(msg);
      },
    }),
  };
}

test('weeklyDigestJob: skips when no recipients are configured', async () => {
  const { db, campaignRepository, referralRepository } = await setup();
  const { emailService, sent } = makeMailer();
  const job = createWeeklyDigestJob({
    db,
    emailService,
    campaignRepository,
    referralRepository,
    getRecipients: () => [],
    logger: silentLogger(),
  });

  const result = await job.run();
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'no_recipients');
  assert.equal(sent.length, 0);
});

test('weeklyDigestJob: sends digest with campaign analytics and checkpoints the week', async () => {
  const { db, campaignRepository, referralRepository } = await setup();
  campaignRepository.create({
    name: 'Launch Campaign',
    slug: 'launch-campaign',
    description: 'test',
    rewardPerAction: 10,
    createdAt: new Date().toISOString(),
  });
  const campaign = campaignRepository.getBySlug('launch-campaign');
  referralRepository.create({
    campaignId: campaign.id,
    referrerAddress: 'GREF',
    refereeAddress: 'GREFEREE',
  });

  const { emailService, sent } = makeMailer();
  const job = createWeeklyDigestJob({
    db,
    emailService,
    campaignRepository,
    referralRepository,
    getRecipients: () => ['ops@example.com'],
    logger: silentLogger(),
  });

  const result = await job.run();
  assert.equal(result.skipped, false);
  assert.equal(result.sent, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'ops@example.com');
  assert.match(sent[0].subject, /Trivela weekly digest/);
  assert.match(sent[0].text, /Launch Campaign/);
  assert.match(sent[0].text, /1 participants/);

  // Second run in the same week is a no-op
  const again = await job.run();
  assert.equal(again.skipped, true);
  assert.equal(again.reason, 'already_sent');
  assert.equal(sent.length, 1);
});

test('weeklyDigestJob: weekKey produces ISO-style keys', async () => {
  const { db } = await setup();
  const job = createWeeklyDigestJob({
    db,
    emailService: createEmailService({}),
    logger: silentLogger(),
  });
  assert.equal(job.weekKey(new Date('2024-01-15T12:00:00Z')), '2024-W03');
  assert.equal(job.weekKey(new Date('2024-12-30T12:00:00Z')), '2025-W01');
});

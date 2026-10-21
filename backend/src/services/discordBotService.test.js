// @ts-check
/**
 * Tests for the Discord bot `/trivela-stats` command (#1349).
 * Run with: node --test src/services/discordBotService.test.js
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDiscordBotService } from './discordBotService.js';

function makeRepo(campaigns) {
  return { list: () => campaigns };
}

test('returns zero metrics for an empty campaign list', () => {
  const svc = createDiscordBotService({ campaignRepository: makeRepo([]) });
  const stats = svc.getTrivelaStats();
  assert.deepEqual(stats, { active: 0, total: 0, participants: 0, rewardPool: 0 });
});

test('counts active campaigns and sums participants and reward pool', () => {
  const svc = createDiscordBotService({
    campaignRepository: makeRepo([
      {
        status: 'active',
        participants: 10,
        rewardPerAction: 5,
        maxParticipants: 100,
      },
      {
        status: 'ended',
        participants: 3,
        rewardPerAction: 2,
        maxParticipants: 50,
      },
      {
        status: 'draft',
        participants: 0,
        rewardPerAction: 1,
        maxParticipants: 10,
      },
    ]),
  });
  const stats = svc.getTrivelaStats();
  assert.equal(stats.total, 3);
  assert.equal(stats.active, 1);
  assert.equal(stats.participants, 13);
  assert.equal(stats.rewardPool, 5 * 100 + 2 * 50 + 1 * 10);
});

test('buildStatsResponse returns a Discord interaction payload', () => {
  const svc = createDiscordBotService({
    campaignRepository: makeRepo([
      { status: 'active', participants: 4, rewardPerAction: 1, maxParticipants: 10 },
    ]),
  });
  const res = svc.buildStatsResponse();
  assert.equal(res.type, 4);
  assert.match(res.data.content, /Active campaigns: \*\*1\*\*/);
  assert.match(res.data.content, /Total participants: \*\*4\*\*/);
  assert.match(res.data.content, /Reward pool: \*\*10\*\*/);
});

test('uses endDate when status is missing to determine active', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const svc = createDiscordBotService({
    campaignRepository: makeRepo([
      { endDate: future, participants: 1, rewardPerAction: 0, maxParticipants: 0 },
      { endDate: past, participants: 1, rewardPerAction: 0, maxParticipants: 0 },
    ]),
  });
  assert.equal(svc.getTrivelaStats().active, 1);
});

// @ts-check
/**
 * Tests for the Telegram bot `/claim` command (#1350).
 * Run with: node --test src/services/telegramBotService.test.js
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createTelegramBotService } from './telegramBotService.js';

function makeBalanceRepo(balances) {
  return { listByRecipient: () => balances };
}

test('returns null when identity cannot be resolved', () => {
  const svc = createTelegramBotService({ identityResolver: () => null });
  assert.equal(svc.getClaimSummary('tg-1'), null);
});

test('sums unclaimed balances and includes streak', () => {
  const svc = createTelegramBotService({
    claimableBalanceRepository: makeBalanceRepo([
      { amount: 5, status: 'pending' },
      { amount: 3, status: 'pending' },
      { amount: 10, status: 'claimed' },
    ]),
    streakService: { getStreak: () => ({ streakDays: 12 }) },
  });
  const summary = svc.getClaimSummary('tg-1');
  assert.equal(summary.claimable, 8);
  assert.equal(summary.streakDays, 12);
  assert.equal(summary.currency, 'XLM');
});

test('buildClaimResponse returns a Telegram sendMessage payload', () => {
  const svc = createTelegramBotService({
    claimableBalanceRepository: makeBalanceRepo([{ amount: 7, status: 'pending' }]),
    streakService: { getStreak: () => ({ streakDays: 7 }) },
  });
  const reply = svc.buildClaimResponse('tg-42');
  assert.equal(reply.chat_id, 'tg-42');
  assert.match(reply.text, /Balance: 7 XLM/);
  assert.match(reply.text, /Current streak: 7 days/);
});

test('handleUpdate responds to /claim command', () => {
  const svc = createTelegramBotService({
    claimableBalanceRepository: makeBalanceRepo([{ amount: 1, status: 'pending' }]),
  });
  const reply = svc.handleUpdate({
    message: { chat: { id: 99 }, text: '/claim@TrivelaBot' },
  });
  assert.equal(reply.chat_id, '99');
  assert.match(reply.text, /claimable rewards/i);
});

test('handleUpdate returns help text for unknown commands', () => {
  const svc = createTelegramBotService({});
  const reply = svc.handleUpdate({
    message: { chat: { id: 1 }, text: '/unknown' },
  });
  assert.match(reply.text, /Available commands/);
});

test('handleUpdate returns null when chat id is missing', () => {
  const svc = createTelegramBotService({});
  assert.equal(svc.handleUpdate({}), null);
});

/**
 * Telegram bot service for `/claim` (#1350).
 *
 * Lets users check claimable reward balances via a Telegram bot command.
 * The handler resolves the user's linked wallet identity and returns a
 * human-readable summary of claimable rewards.
 */

/**
 * @typedef {{ identity: string, claimable: number, currency: string, streakDays: number }} ClaimSummary
 */

/**
 * @param {{
 *   claimableBalanceRepository?: {
 *     listByRecipient: (identity: string) => Array<any>,
 *   },
 *   streakService?: ReturnType<import('./streakService.js').createStreakService>,
 *   identityResolver?: (telegramId: string) => string | null,
 *   rewardCurrency?: string,
 * }} deps
 */
export function createTelegramBotService({
  claimableBalanceRepository,
  streakService,
  identityResolver = (id) => id,
  rewardCurrency = 'XLM',
} = {}) {
  /**
   * Resolve claimable reward summary for a Telegram user.
   * @param {string} telegramUserId
   * @returns {ClaimSummary | null} null when the user has no linked wallet
   */
  function getClaimSummary(telegramUserId) {
    const identity = identityResolver(telegramUserId);
    if (!identity) return null;

    const balances = claimableBalanceRepository?.listByRecipient?.(identity) ?? [];
    const claimable = balances
      .filter((b) => (b.status ?? 'pending') !== 'claimed')
      .reduce((sum, b) => sum + Number(b.amount ?? 0), 0);

    const streak = streakService?.getStreak?.(identity);
    const streakDays = streak?.streakDays ?? 0;

    return {
      identity,
      claimable: Math.round(claimable * 100) / 100,
      currency: rewardCurrency,
      streakDays,
    };
  }

  /**
   * Build a Telegram sendMessage payload for the `/claim` command.
   * @param {string} telegramUserId
   * @returns {{ chat_id: string, text: string }}
   */
  function buildClaimResponse(telegramUserId) {
    const summary = getClaimSummary(telegramUserId);

    if (!summary) {
      return {
        chat_id: String(telegramUserId),
        text: 'Link your wallet first to check claimable rewards.',
      };
    }

    const lines = [
      'Your claimable rewards:',
      `Balance: ${summary.claimable.toLocaleString()} ${summary.currency}`,
      `Current streak: ${summary.streakDays} day${summary.streakDays === 1 ? '' : 's'}`,
    ];

    return {
      chat_id: String(telegramUserId),
      text: lines.join('\n'),
    };
  }

  /**
   * Handle an incoming Telegram update (webhook body).
   * Only `/claim` is supported; other messages get a hint reply.
   * @param {{ message?: { chat?: { id?: number|string }, from?: { id?: number|string }, text?: string } }} update
   * @returns {{ chat_id: string, text: string } | null}
   */
  function handleUpdate(update) {
    const message = update?.message;
    const chatId = message?.chat?.id ?? message?.from?.id;
    if (chatId == null) return null;

    const text = String(message?.text ?? '').trim();
    const command = text.split(/\s+/)[0]?.split('@')[0]?.toLowerCase() ?? '';

    if (command === '/claim') {
      return buildClaimResponse(chatId);
    }

    return {
      chat_id: String(chatId),
      text: 'Available commands:\n/claim — check your claimable reward balance',
    };
  }

  return { getClaimSummary, buildClaimResponse, handleUpdate };
}

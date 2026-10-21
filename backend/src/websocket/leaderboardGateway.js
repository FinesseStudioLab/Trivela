// @ts-check
import { maskWallet } from './server.js';

/**
 * Real-time campaign leaderboard gateway (#1257).
 *
 * When points are awarded, the leaderboard is recomputed (bursts coalesced
 * into one recompute), diffed against the last snapshot and — only if the
 * ranking actually changed — pushed to every WebSocket client subscribed to
 * that campaign's leaderboard:
 *
 *   -> { "type": "subscribe", "channel": "leaderboard", "campaignId": "42" }
 *   <- { "type": "leaderboard_snapshot", "campaignId": "42", "entries": [...] }
 *   <- { "type": "leaderboard_update",   "campaignId": "42", "entries": [...], "changes": [...] }
 *
 * Wallets are masked before they leave the server.
 */

export const LEADERBOARD_CHANNEL = 'leaderboard';

/** @param {string | number} campaignId */
export const leaderboardRoom = (campaignId) => `${LEADERBOARD_CHANNEL}:campaign:${campaignId}`;

/**
 * @typedef {{ wallet: string, rank: number, points: number }} Entry
 * @typedef {{ wallet: string, rank: number, previousRank: number | null,
 *   points: number, previousPoints: number | null,
 *   change: 'new' | 'up' | 'down' | 'same' }} Change
 */

/**
 * Compare two ranked lists and describe what moved. Only entries whose rank or
 * points differ from `previous` are returned.
 *
 * @param {Entry[]} previous
 * @param {Entry[]} next
 * @returns {Change[]}
 */
export function diffLeaderboards(previous, next) {
  const before = new Map(previous.map((e) => [e.wallet, e]));
  /** @type {Change[]} */
  const changes = [];
  for (const entry of next) {
    const old = before.get(entry.wallet);
    if (!old) {
      changes.push({ ...entry, previousRank: null, previousPoints: null, change: 'new' });
    } else if (old.rank !== entry.rank || old.points !== entry.points) {
      changes.push({
        ...entry,
        previousRank: old.rank,
        previousPoints: old.points,
        change: entry.rank < old.rank ? 'up' : entry.rank > old.rank ? 'down' : 'same',
      });
    }
  }
  return changes;
}

/**
 * @param {{
 *   getLeaderboard: (campaignId: string) => Entry[],
 *   publish: (campaignId: string, message: Record<string, unknown>) => number,
 *   limit?: number,
 *   debounceMs?: number,
 *   logger?: { warn?: Function },
 * }} options
 */
export function createLeaderboardGateway({
  getLeaderboard,
  publish,
  limit = 10,
  debounceMs = 200,
  logger = console,
}) {
  /** @type {Map<string, Entry[]>} */
  const last = new Map();
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const timers = new Map();

  const mask = (/** @type {Entry[]} */ entries) =>
    entries.map((e) => ({ rank: e.rank, wallet: maskWallet(e.wallet), points: e.points }));

  /** @param {string | number} campaignId */
  function top(campaignId) {
    return getLeaderboard(String(campaignId)).slice(0, limit);
  }

  /** Current leaderboard, e.g. to greet a new subscriber. */
  function snapshot(/** @type {string | number} */ campaignId) {
    const entries = top(campaignId);
    if (!last.has(String(campaignId))) last.set(String(campaignId), entries);
    return {
      type: 'leaderboard_snapshot',
      campaignId: String(campaignId),
      entries: mask(entries),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Recompute now and publish when the ranking changed.
   * @returns {number} clients notified (0 when nothing changed)
   */
  function flush(/** @type {string | number} */ campaignId) {
    const id = String(campaignId);
    timers.delete(id);
    try {
      const next = top(id);
      const previous = last.get(id) ?? [];
      const changes = diffLeaderboards(previous, next);
      last.set(id, next);
      if (changes.length === 0) return 0;
      return publish(id, {
        type: 'leaderboard_update',
        campaignId: id,
        entries: mask(next),
        changes: changes.map((c) => ({ ...c, wallet: maskWallet(c.wallet) })),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn?.({ err, campaignId: id }, 'leaderboard:publish_failed');
      return 0;
    }
  }

  /**
   * Call after points were awarded in a campaign. Bursts within `debounceMs`
   * produce a single recompute.
   */
  function trigger(/** @type {string | number} */ campaignId) {
    const id = String(campaignId);
    if (debounceMs <= 0) return flush(id);
    if (timers.has(id)) return 0;
    const timer = setTimeout(() => flush(id), debounceMs);
    timer.unref?.();
    timers.set(id, timer);
    return 0;
  }

  function stop() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  }

  return { trigger, flush, snapshot, stop };
}

// Live activity feed state helpers (#1201). Pure so they can be unit tested
// without a WebSocket.

export const ACTIVITY_CHANNEL = 'activity';
export const MAX_FEED_ITEMS = 20;
const KINDS = new Set(['registration', 'claim']);
const STROOPS_PER_UNIT = 10_000_000;

/**
 * Validate an incoming `activity` WebSocket message. Returns a normalized item
 * or null for anything malformed, so a bad frame can never break the widget.
 */
export function normalizeActivity(message) {
  if (!message || message.type !== 'activity' || !KINDS.has(message.kind)) return null;
  if (typeof message.id !== 'string' || !message.id) return null;
  if (typeof message.wallet !== 'string' || !message.wallet) return null;
  const time = Date.parse(message.timestamp);
  return {
    id: message.id,
    kind: message.kind,
    wallet: message.wallet,
    campaignId: message.campaignId != null ? String(message.campaignId) : null,
    amount: message.amount != null ? String(message.amount) : null,
    timestamp: Number.isNaN(time) ? Date.now() : time,
  };
}

/** Newest first, de-duplicated by id, capped at `max` items. */
export function addActivity(items, item, max = MAX_FEED_ITEMS) {
  if (!item || items.some((existing) => existing.id === item.id)) return items;
  return [item, ...items].slice(0, max);
}

/** Contract amounts are i128 stroops (7 decimals); show up to 2 decimals. */
export function formatActivityAmount(amount) {
  if (amount == null || amount === '') return null;
  const value = Number(amount) / STROOPS_PER_UNIT;
  if (!Number.isFinite(value)) return null;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function describeActivity(item) {
  const campaign = item.campaignId ? ` campaign #${item.campaignId}` : ' a campaign';
  if (item.kind === 'claim') {
    const amount = formatActivityAmount(item.amount);
    return `${item.wallet} claimed ${amount ? `${amount} points` : 'rewards'}${item.campaignId ? ` from${campaign}` : ''}`;
  }
  return `${item.wallet} joined${campaign}`;
}

export function formatRelativeTime(timestamp, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

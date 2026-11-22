// @ts-check
import { isIPv4, isIPv6 } from 'node:net';

/**
 * Automated fraud detection for multi-account signups (#1258).
 *
 * Signups are grouped by network prefix (/24 for IPv4, /64 for IPv6) and by
 * known proxy exit nodes. When too many distinct accounts register from one
 * group inside the sliding window, a flag is raised for manual review. Flags
 * never block a signup; they only surface anomalies to operators.
 *
 * Privacy: only the network prefix of an address is persisted, except for
 * addresses that match the configured (public) proxy exit list.
 */

export const RULE_SUBNET_CLUSTER = 'ip_subnet_cluster';
export const RULE_PROXY_EXIT = 'proxy_exit_node';
export const FLAG_STATUSES = ['open', 'dismissed', 'confirmed'];

/** Strip brackets, zone ids and the IPv4-mapped IPv6 prefix. @param {unknown} raw */
export function normalizeIp(raw) {
  if (typeof raw !== 'string') return null;
  let ip = raw.trim();
  if (ip.startsWith('[') && ip.includes(']')) ip = ip.slice(1, ip.indexOf(']'));
  ip = ip.split('%')[0];
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) ip = mapped[1];
  return isIPv4(ip) || isIPv6(ip) ? ip.toLowerCase() : null;
}

/** @param {string} ip @returns {number} */
function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, octet) => acc * 256 + Number(octet), 0);
}

/** @param {string} ip IPv6 address @returns {string[]} eight hextets */
function expandIpv6(ip) {
  const [head, tail] = ip.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const fill = ip.includes('::') ? 8 - headParts.length - tailParts.length : 0;
  return [...headParts, ...Array(Math.max(fill, 0)).fill('0'), ...tailParts].map((h) =>
    parseInt(h, 16).toString(16),
  );
}

/**
 * Network prefix used to cluster signups: /24 for IPv4, /64 for IPv6.
 *
 * @param {unknown} raw
 * @returns {string | null} e.g. `203.0.113.0/24` or `2001:db8:1:2::/64`
 */
export function getSubnetKey(raw) {
  const ip = normalizeIp(raw);
  if (!ip) return null;
  if (isIPv4(ip)) {
    const [a, b, c] = ip.split('.');
    return `${a}.${b}.${c}.0/24`;
  }
  const hextets = expandIpv6(ip);
  if (hextets.length !== 8 || hextets.some((h) => h === 'NaN')) return null;
  return `${hextets.slice(0, 4).join(':')}::/64`;
}

/**
 * Build a matcher for a list of proxy exit nodes. Entries may be exact IPs or
 * IPv4 CIDR ranges (e.g. `198.51.100.0/24`).
 *
 * @param {string[]} entries
 * @returns {(ip: unknown) => string | null} the matching list entry's base address, or null
 */
export function createProxyMatcher(entries = []) {
  /** @type {Set<string>} */
  const exact = new Set();
  /** @type {Array<{ base: number, mask: number }>} */
  const ranges = [];

  for (const entry of entries.map((e) => e.trim()).filter(Boolean)) {
    const [addr, bitsRaw] = entry.split('/');
    const ip = normalizeIp(addr);
    if (!ip) continue;
    if (bitsRaw === undefined) {
      exact.add(ip);
    } else if (isIPv4(ip)) {
      const bits = Number(bitsRaw);
      if (!Number.isInteger(bits) || bits < 0 || bits > 32) continue;
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      ranges.push({ base: (ipv4ToInt(ip) & mask) >>> 0, mask });
    }
  }

  return (raw) => {
    const ip = normalizeIp(raw);
    if (!ip) return null;
    if (exact.has(ip)) return ip;
    if (isIPv4(ip)) {
      const value = ipv4ToInt(ip);
      if (ranges.some((r) => (value & r.mask) >>> 0 === r.base)) return ip;
    }
    return null;
  };
}

/**
 * @typedef {{
 *   id: number, campaignId: string, rule: string, subject: string, accountCount: number,
 *   accounts: string[], status: string, firstSeenAt: string, lastSeenAt: string,
 * }} FraudFlag
 */

/** @returns {FraudFlag} */
function rowToFlag(row) {
  let accounts = [];
  try {
    accounts = JSON.parse(row.accounts);
  } catch {
    /* keep [] for corrupt rows */
  }
  return {
    id: row.id,
    campaignId: row.campaign_id,
    rule: row.rule,
    subject: row.subject,
    accountCount: row.account_count,
    accounts,
    status: row.status,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}

/**
 * @param {{
 *   db: InstanceType<import('better-sqlite3')>,
 *   subnetThreshold?: number,
 *   proxyThreshold?: number,
 *   windowMs?: number,
 *   proxyList?: string[],
 *   logger?: { warn?: Function },
 *   now?: () => number,
 * }} options
 */
export function createFraudDetector({
  db,
  subnetThreshold = 3,
  proxyThreshold = 2,
  windowMs = 24 * 60 * 60 * 1000,
  proxyList = [],
  logger = console,
  now = () => Date.now(),
}) {
  const matchProxy = createProxyMatcher(proxyList);

  const insertEvent = db.prepare(
    `INSERT INTO signup_events (campaign_id, account, ip_subnet, proxy_exit, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const subnetAccounts = db.prepare(
    `SELECT DISTINCT account FROM signup_events
      WHERE campaign_id = ? AND ip_subnet = ? AND created_at >= ?`,
  );
  const proxyAccounts = db.prepare(
    `SELECT DISTINCT account FROM signup_events
      WHERE campaign_id = ? AND proxy_exit = ? AND created_at >= ?`,
  );
  const upsertFlag = db.prepare(
    `INSERT INTO fraud_flags
       (campaign_id, rule, subject, account_count, accounts, status, first_seen_at, last_seen_at)
     VALUES (@campaignId, @rule, @subject, @count, @accounts, 'open', @at, @at)
     ON CONFLICT (campaign_id, rule, subject) DO UPDATE SET
       account_count = excluded.account_count,
       accounts      = excluded.accounts,
       last_seen_at  = excluded.last_seen_at,
       status        = CASE
         WHEN fraud_flags.status = 'dismissed' AND excluded.account_count > fraud_flags.account_count
           THEN 'open'
         ELSE fraud_flags.status
       END`,
  );
  const flagBySubject = db.prepare(
    'SELECT * FROM fraud_flags WHERE campaign_id = ? AND rule = ? AND subject = ?',
  );

  /**
   * @param {string} campaignId
   * @param {string} rule
   * @param {string} subject
   * @param {string[]} accounts
   * @param {string} at
   */
  function raise(campaignId, rule, subject, accounts, at) {
    upsertFlag.run({
      campaignId,
      rule,
      subject,
      count: accounts.length,
      accounts: JSON.stringify(accounts),
      at,
    });
    logger.warn?.({ campaignId, rule, subject, accounts: accounts.length }, 'fraud:flag');
    return rowToFlag(flagBySubject.get(campaignId, rule, subject));
  }

  return {
    /**
     * Record a signup and evaluate the clustering rules.
     *
     * @param {{ campaignId: string | number, account: string, ip: unknown }} signup
     * @returns {{ flags: FraudFlag[] }} flags raised or refreshed by this signup
     */
    recordSignup({ campaignId, account, ip }) {
      const subnet = getSubnetKey(ip);
      if (!subnet) return { flags: [] };

      const campaign = String(campaignId);
      const at = new Date(now()).toISOString();
      const since = new Date(now() - windowMs).toISOString();
      const proxyExit = matchProxy(ip);

      insertEvent.run(campaign, account, subnet, proxyExit, at);

      /** @type {FraudFlag[]} */
      const flags = [];

      const inSubnet = subnetAccounts.all(campaign, subnet, since).map((r) => r.account);
      if (inSubnet.length >= subnetThreshold) {
        flags.push(raise(campaign, RULE_SUBNET_CLUSTER, subnet, inSubnet, at));
      }

      if (proxyExit) {
        const viaProxy = proxyAccounts.all(campaign, proxyExit, since).map((r) => r.account);
        if (viaProxy.length >= proxyThreshold) {
          flags.push(raise(campaign, RULE_PROXY_EXIT, proxyExit, viaProxy, at));
        }
      }

      return { flags };
    },

    /**
     * @param {{ status?: string, campaignId?: string, limit?: number, offset?: number }} [filter]
     */
    listFlags({ status, campaignId, limit = 50, offset = 0 } = {}) {
      const where = [];
      const params = [];
      if (status) {
        where.push('status = ?');
        params.push(status);
      }
      if (campaignId) {
        where.push('campaign_id = ?');
        params.push(String(campaignId));
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = db.prepare(`SELECT COUNT(*) AS n FROM fraud_flags ${clause}`).get(...params).n;
      const rows = db
        .prepare(
          `SELECT * FROM fraud_flags ${clause} ORDER BY last_seen_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, Math.min(Math.max(limit, 1), 200), Math.max(offset, 0));
      return { data: rows.map(rowToFlag), total };
    },

    /** @param {number} id @param {string} status @returns {FraudFlag | null} */
    updateFlagStatus(id, status) {
      if (!FLAG_STATUSES.includes(status)) throw new Error(`Invalid status: ${status}`);
      const result = db.prepare('UPDATE fraud_flags SET status = ? WHERE id = ?').run(status, id);
      if (result.changes === 0) return null;
      return rowToFlag(db.prepare('SELECT * FROM fraud_flags WHERE id = ?').get(id));
    },

    /** Drop signup events that have aged out of the detection window. */
    pruneEvents() {
      const cutoff = new Date(now() - windowMs).toISOString();
      return db.prepare('DELETE FROM signup_events WHERE created_at < ?').run(cutoff).changes;
    },
  };
}

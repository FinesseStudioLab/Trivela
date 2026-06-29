// @ts-check

/**
 * Referral fraud detection and sybil scoring service.
 *
 * Scores each referral on a 0-100 risk scale using multiple heuristics.
 * Referrals exceeding the warning/hold thresholds are flagged for admin
 * review rather than being auto-rewarded.
 *
 * ## Heuristics
 * 1. **Self-referral** (weight: 100) — referrer == referee
 * 2. **Velocity burst** (weight: 40) — same referrer, N refs in short window
 * 3. **Circular graph** (weight: 60) — A→B, B→C, C→A rings
 * 4. **New-account burst** (weight: 30) — referee created very recently
 * 5. **IP/device reuse** (weight: 50) — multiple refs from same IP/device
 */

/** Risk score configuration — all thresholds are tuneable. */
export const DEFAULT_RISK_CONFIG = Object.freeze({
    /** Max referrals per referrer in the velocity window before scoring kicks in. */
    velocityMaxRefs: 5,
    /** Time window for velocity checks (milliseconds). */
    velocityWindowMs: 60 * 60 * 1000, // 1 hour
    /** Minimum cycle length to trigger circular detection (e.g. 3 = A→B→C→A). */
    circularMinCycleLength: 3,
    /** Score thresholds for actions. */
    holdThreshold: 70,
    warnThreshold: 40,
});

/** @typedef {typeof DEFAULT_RISK_CONFIG} RiskConfig */

// ─── Scoring helpers ─────────────────────────────────────────────────────────

/**
 * Score a single referral against known data.
 *
 * @param {object} params
 * @param {string} params.referrer
 * @param {string} params.referee
 * @param {{ referrer: string; referee: string; createdAt: string }[]} params.recentReferrals
 * @param {Map<string, string[]>} params.ipMap — referee → [ip, ...]
 * @param {Map<string, string[]>} params.deviceMap — referee → [deviceId, ...]
 * @param {string} [params.ip]
 * @param {string} [params.deviceId]
 * @param {Map<string, number>} [params.accountAgesMs] — referee → ms since creation
 * @param {RiskConfig} [params.config]
 * @returns {{ score: number; flags: string[] }}
 */
export function scoreReferral({
    referrer,
    referee,
    recentReferrals,
    ipMap = new Map(),
    deviceMap = new Map(),
    ip,
    deviceId,
    accountAgesMs = new Map(),
    config = DEFAULT_RISK_CONFIG,
}) {
    let score = 0;
    const flags = [];

    // 1. Self-referral
    if (referrer === referee) {
        score += 100;
        flags.push('self_referral');
        return { score, flags }; // immediate max score — no further checks needed
    }

    // 2. Velocity burst — same referrer sending many refs in a short window
    const now = Date.now();
    const referrerRefs = recentReferrals.filter(
        (r) => r.referrer === referrer &&
            now - new Date(r.createdAt).getTime() <= config.velocityWindowMs,
    );
    if (referrerRefs.length >= config.velocityMaxRefs) {
        const velocityScore = Math.min(
            100,
            40 + (referrerRefs.length - config.velocityMaxRefs) * 10,
        );
        score += velocityScore;
        flags.push(`velocity_burst_${referrerRefs.length}`);
    }

    // 3. Circular graph detection
    if (detectCycle(referrer, referee, recentReferrals, config.circularMinCycleLength)) {
        score += 60;
        flags.push('circular_pattern');
    }

    // 4. New-account burst
    const age = accountAgesMs.get(referee);
    if (age !== undefined && age < 24 * 60 * 60 * 1000) {
        // account less than 24h old
        score += 30;
        flags.push('new_account');
    }

    // 5. IP/device reuse
    const ipAddrs = ip ? (ipMap.get(referee) ?? []) : [];
    if (ip && ipAddrs.length >= 3) {
        score += 50;
        flags.push('ip_reuse');
    }
    const devices = deviceId ? (deviceMap.get(referee) ?? []) : [];
    if (deviceId && devices.length >= 3) {
        score += 50;
        flags.push('device_reuse');
    }

    return { score: Math.min(100, score), flags };
}

/**
 * Check for circular referral patterns (A→B→C→A).
 * @param {string} referrer
 * @param {string} referee
 * @param {{ referrer: string; referee: string }[]} allRefs
 * @param {number} minCycleLength
 * @returns {boolean}
 */
function detectCycle(referrer, referee, allRefs, minCycleLength) {
    // Build adjacency from existing referrals
    const graph = new Map();
    for (const { referrer: from, referee: to } of allRefs) {
        if (!graph.has(from)) graph.set(from, []);
        graph.get(from).push(to);
    }
    // Add the pending edge
    if (!graph.has(referrer)) graph.set(referrer, []);
    graph.get(referrer).push(referee);

    // BFS from referee to check if we can reach referrer
    const visited = new Set();
    const queue = [referee];
    let depth = 0;

    while (queue.length > 0) {
        const levelSize = queue.length;
        for (let i = 0; i < levelSize; i++) {
            const node = queue.shift();
            if (node === referrer && depth >= minCycleLength - 1) return true;
            if (visited.has(node)) continue;
            visited.add(node);
            const neighbors = graph.get(node) ?? [];
            queue.push(...neighbors);
        }
        depth++;
    }
    return false;
}

/**
 * Determine the action for a given risk score.
 * @param {number} score
 * @param {RiskConfig} [config]
 * @returns {'approved' | 'warning' | 'hold'}
 */
export function actionForScore(score, config = DEFAULT_RISK_CONFIG) {
    if (score >= config.holdThreshold) return 'hold';
    if (score >= config.warnThreshold) return 'warning';
    return 'approved';
}
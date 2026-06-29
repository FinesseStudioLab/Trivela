// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreReferral, actionForScore, DEFAULT_RISK_CONFIG } from './referralFraudService.js';

// ─── Self-referral ──────────────────────────────────────────────────────────

describe('scoreReferral — self-referral', () => {
    it('flags self-referral with score 100', () => {
        const { score, flags } = scoreReferral({
            referrer: 'GALICE',
            referee: 'GALICE',
            recentReferrals: [],
        });
        assert.equal(score, 100);
        assert.deepStrictEqual(flags, ['self_referral']);
    });

    it('returns immediately on self-referral without checking other heuristics', () => {
        const now = new Date();
        const recent = Array.from({ length: 10 }, (_, i) => ({
            referrer: 'GALICE',
            referee: `GBOB${i}`,
            createdAt: now.toISOString(),
        }));
        const { score, flags } = scoreReferral({
            referrer: 'GALICE',
            referee: 'GALICE',
            recentReferrals: recent,
        });
        assert.equal(score, 100);
        assert.deepStrictEqual(flags, ['self_referral']);
    });
});

// ─── Velocity burst ─────────────────────────────────────────────────────────

describe('scoreReferral — velocity burst', () => {
    it('scores referrals above max velocity threshold', () => {
        const now = new Date();
        const recent = Array.from({ length: 6 }, (_, i) => ({
            referrer: 'GALICE',
            referee: `GBOB${i}`,
            createdAt: now.toISOString(),
        }));
        const { score, flags } = scoreReferral({
            referrer: 'GALICE',
            referee: 'GBOB_NEW',
            recentReferrals: recent,
            config: { ...DEFAULT_RISK_CONFIG, velocityMaxRefs: 5 },
        });
        assert.ok(score >= 40);
        assert.ok(flags.some((f) => f.startsWith('velocity_burst')));
    });

    it('does not flag referrals within velocity limit', () => {
        const now = new Date();
        const recent = Array.from({ length: 2 }, (_, i) => ({
            referrer: 'GALICE',
            referee: `GBOB${i}`,
            createdAt: now.toISOString(),
        }));
        const { score, flags } = scoreReferral({
            referrer: 'GALICE',
            referee: 'GBOB_NEW',
            recentReferrals: recent,
            config: { ...DEFAULT_RISK_CONFIG, velocityMaxRefs: 5 },
        });
        assert.equal(score, 0);
        assert.deepStrictEqual(flags, []);
    });
});

// ─── Circular graph detection ───────────────────────────────────────────────

describe('scoreReferral — circular patterns', () => {
    it('detects A→B→C→A rings', () => {
        const recent = [
            { referrer: 'GA', referee: 'GB', createdAt: new Date().toISOString() },
            { referrer: 'GB', referee: 'GC', createdAt: new Date().toISOString() },
            { referrer: 'GC', referee: 'GA', createdAt: new Date().toISOString() },
        ];
        const { score, flags } = scoreReferral({
            referrer: 'GC',
            referee: 'GA',
            recentReferrals: recent.slice(0, 2), // A→B, B→C already stored
        });
        assert.ok(score >= 60);
        assert.ok(flags.includes('circular_pattern'));
    });

    it('detects longer A→B→C→D→A rings', () => {
        const recent = [
            { referrer: 'GA', referee: 'GB', createdAt: new Date().toISOString() },
            { referrer: 'GB', referee: 'GC', createdAt: new Date().toISOString() },
            { referrer: 'GC', referee: 'GD', createdAt: new Date().toISOString() },
            { referrer: 'GD', referee: 'GA', createdAt: new Date().toISOString() },
        ];
        const { score, flags } = scoreReferral({
            referrer: 'GD',
            referee: 'GA',
            recentReferrals: recent.slice(0, 3),
        });
        assert.ok(score >= 60);
        assert.ok(flags.includes('circular_pattern'));
    });

    it('does not flag linear (non-circular) chains', () => {
        const recent = [
            { referrer: 'GA', referee: 'GB', createdAt: new Date().toISOString() },
            { referrer: 'GB', referee: 'GC', createdAt: new Date().toISOString() },
        ];
        const { score, flags } = scoreReferral({
            referrer: 'GC',
            referee: 'GD',
            recentReferrals: recent,
        });
        assert.ok(!flags.includes('circular_pattern'));
    });
});

// ─── IP/device reuse ────────────────────────────────────────────────────────

describe('scoreReferral — IP/device reuse', () => {
    it('flags when same IP appears 3+ times', () => {
        const ipMap = new Map([['GBOB', ['1.2.3.4', '1.2.3.4', '1.2.3.4']]]);
        const { score, flags } = scoreReferral({
            referrer: 'GALICE',
            referee: 'GBOB',
            recentReferrals: [],
            ipMap,
            ip: '1.2.3.4',
        });
        assert.ok(score >= 50);
        assert.ok(flags.includes('ip_reuse'));
    });
});

// ─── Action thresholds ──────────────────────────────────────────────────────

describe('actionForScore', () => {
    it('returns approved for low scores', () => {
        assert.equal(actionForScore(0), 'approved');
        assert.equal(actionForScore(39), 'approved');
    });

    it('returns warning for moderate scores', () => {
        assert.equal(actionForScore(40), 'warning');
        assert.equal(actionForScore(69), 'warning');
    });

    it('returns hold for high scores', () => {
        assert.equal(actionForScore(70), 'hold');
        assert.equal(actionForScore(100), 'hold');
    });

    it('honours custom thresholds', () => {
        const config = { ...DEFAULT_RISK_CONFIG, holdThreshold: 50 };
        assert.equal(actionForScore(55, config), 'hold');
    });
});

// ─── Integration: multi-heuristic scoring ───────────────────────────────────

describe('scoreReferral — combined heuristics', () => {
    it('stacks multiple flags', () => {
        const now = new Date();
        const recent = Array.from({ length: 7 }, (_, i) => ({
            referrer: 'GALICE',
            referee: `GBOB${i}`,
            createdAt: now.toISOString(),
        }));
        const ipMap = new Map([['GBOB_NEW', ['1.2.3.4', '1.2.3.4', '1.2.3.4']]]);
        const { score, flags } = scoreReferral({
            referrer: 'GALICE',
            referee: 'GBOB_NEW',
            recentReferrals: recent,
            ipMap,
            ip: '1.2.3.4',
            config: { ...DEFAULT_RISK_CONFIG, velocityMaxRefs: 5 },
        });
        assert.ok(score >= 90);
        assert.ok(flags.includes('ip_reuse'));
        assert.ok(flags.some((f) => f.startsWith('velocity_burst')));
    });
});
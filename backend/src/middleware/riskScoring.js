import { log as logger } from './logger.js';

const WINDOW_MS = 60_000;
const DEFAULT_VELOCITY_LIMIT = 5;
const DEFAULT_STEP_UP_THRESHOLD = 60;
const DEFAULT_BLOCK_THRESHOLD = 85;

// In-memory sliding window: key -> [timestamp, ...]
const velocityStore = new Map();

function pruneWindow(timestamps, now) {
  const cutoff = now - WINDOW_MS;
  return timestamps.filter((t) => t >= cutoff);
}

function getIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Score a registration attempt from 0 (clean) to 100 (high-risk).
 *
 * Signals:
 *   - velocity: registrations per IP in the past 60 s
 *   - fingerprint: device fingerprint hash supplied in X-Device-Fingerprint header
 *   - timing: suspiciously fast form submission (< 2 s)
 *
 * @param {object} signals
 * @returns {{ score: number, reasons: string[] }}
 */
function scoreRequest(signals) {
  let score = 0;
  const reasons = [];

  const { velocityCount, velocityLimit, hasFingerprint, submissionMs } = signals;

  // Velocity: linear ramp up to 50 points when at 2× the per-IP limit.
  if (velocityCount > 0) {
    const ratio = velocityCount / velocityLimit;
    const velocityScore = Math.min(50, Math.round(ratio * 25));
    if (velocityScore > 0) {
      score += velocityScore;
      reasons.push(`velocity:${velocityCount}/${velocityLimit}/min`);
    }
  }

  // Missing device fingerprint: likely headless browser or script.
  if (!hasFingerprint) {
    score += 20;
    reasons.push('no-fingerprint');
  }

  // Suspiciously fast submission (bot-like timing).
  if (typeof submissionMs === 'number' && submissionMs < 2_000) {
    score += 15;
    reasons.push(`fast-submission:${submissionMs}ms`);
  }

  return { score: Math.min(100, score), reasons };
}

/**
 * Express middleware factory for registration risk scoring.
 *
 * Attaches `req.riskScore` and `req.riskReasons` to the request.
 * Responds with 429 when the score exceeds the block threshold,
 * or sets `req.riskStepUp = true` for the step-up-challenge band.
 *
 * @param {object} [options]
 * @param {number} [options.velocityLimit=5]       Max registrations per IP per minute before scoring starts.
 * @param {number} [options.stepUpThreshold=60]    Score at which a step-up challenge is required.
 * @param {number} [options.blockThreshold=85]     Score at which the request is soft-blocked.
 * @returns {import('express').RequestHandler}
 */
export function createRiskScoring(options = {}) {
  const velocityLimit = options.velocityLimit ?? DEFAULT_VELOCITY_LIMIT;
  const stepUpThreshold = options.stepUpThreshold ?? DEFAULT_STEP_UP_THRESHOLD;
  const blockThreshold = options.blockThreshold ?? DEFAULT_BLOCK_THRESHOLD;

  return function riskScoringMiddleware(req, res, next) {
    const now = Date.now();
    const ip = getIp(req);

    // Update velocity window.
    const existing = pruneWindow(velocityStore.get(ip) ?? [], now);
    existing.push(now);
    velocityStore.set(ip, existing);

    // Privacy-preserving: only check presence of the fingerprint header, never store it.
    const hasFingerprint = Boolean(req.headers['x-device-fingerprint']);
    const submissionMs = Number(req.headers['x-form-render-ms']) || undefined;

    const { score, reasons } = scoreRequest({
      velocityCount: existing.length,
      velocityLimit,
      hasFingerprint,
      submissionMs,
    });

    req.riskScore = score;
    req.riskReasons = reasons;
    req.riskStepUp = false;

    if (score >= blockThreshold) {
      logger.warn({ ip, score, reasons }, 'registration soft-blocked by risk scoring');
      return res.status(429).json({
        error: 'Registration temporarily unavailable. Please try again later.',
        code: 'RISK_BLOCKED',
      });
    }

    if (score >= stepUpThreshold) {
      req.riskStepUp = true;
      logger.info({ ip, score, reasons }, 'registration step-up required');
    }

    return next();
  };
}

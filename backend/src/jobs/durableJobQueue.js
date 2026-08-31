// @ts-check
import { randomUUID } from 'node:crypto';
import { computeBackoffMs } from './jobRunner.js';
import { getRequestId, runWithRequestId } from '../lib/requestContext.js';

/**
 * Durable job queue with exponential backoff, dead-letter queue, and crash recovery.
 *
 * Backed by a persistent store (SQLite via `sqliteJobQueueRepository`).
 * Jobs survive process restarts. Stale running jobs (worker crash) are
 * re-queued on startup via the visibility timeout mechanism.
 *
 * @param {{
 *   store: ReturnType<import('../dal/sqliteJobQueueRepository.js').createSqliteJobQueueRepository>,
 *   handlers?: Record<string, (payload: unknown) => Promise<void>>,
 *   logger?: { info?: Function, warn?: Function, error?: Function },
 *   deadLetter?: { record: (entry: object) => unknown },
 *   visibilityTimeoutMs?: number,
 *   pollIntervalMs?: number,
 * }} options
 */
export function createDurableJobQueue(
  {
    store,
    handlers = {},
    logger = console,
    deadLetter,
    visibilityTimeoutMs = 60_000,
    pollIntervalMs = 5_000,
  } = /** @type {any} */ ({}),
) {
  let stopped = false;
  let processing = false;
  let pollTimer = null;

  /**
   * Enqueue a new durable job.
   *
   * @param {string} type
   * @param {unknown} [payload]
   * @param {{ runAt?: string, maxAttempts?: number, baseDelayMs?: number, maxDelayMs?: number }} [opts]
   */
  function enqueue(type, payload, opts = {}) {
    const now = new Date().toISOString();
    const runAt = opts.runAt ?? now;
    store.enqueue({
      id: randomUUID(),
      type,
      payload,
      maxAttempts: opts.maxAttempts ?? 5,
      baseDelayMs: opts.baseDelayMs ?? 1_000,
      maxDelayMs: opts.maxDelayMs ?? 30_000,
      runAt,
      visibleAt: runAt,
      enqueuedAt: now,
      // Captured from the enqueuing call's context (#925), persisted so it
      // survives a process restart before the job is claimed.
      requestId: getRequestId(),
    });
    // Fire a poll without awaiting — safe since processNext is guarded by `processing`
    processNext().catch((err) => logger.error?.({ err }, 'durableQueue:processNext_error'));
  }

  /** Start the poll loop and recover any stale jobs from a previous crash. */
  function start() {
    const recovered = store.recoverStale(visibilityTimeoutMs);
    if (recovered > 0) {
      logger.info?.({ staleJobs: recovered }, 'durableQueue:recovered');
    }
    pollTimer = setInterval(() => {
      processNext().catch((err) => logger.error?.({ err }, 'durableQueue:poll_error'));
    }, pollIntervalMs);
    pollTimer.unref?.();
  }

  /** Stop the poll loop. In-flight processNext() calls will complete naturally. */
  function stop() {
    stopped = true;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  /** Claim and process one job. Guarded by `processing` to prevent overlap. */
  async function processNext() {
    if (stopped || processing) return;
    processing = true;

    let job = null;
    try {
      job = store.claimNext(visibilityTimeoutMs);
      if (!job) return;
      // Re-establish the enqueuing request's correlation ID (or mint a fresh
      // one, e.g. for jobs enqueued outside any request) so every log line
      // for this job run — including ones from deep inside the handler —
      // carries it (#925). The ID survives a process restart because it's
      // persisted on the job row (migration 035).
      await runWithRequestId(job.requestId, () => processClaimedJob(job));
    } finally {
      processing = false;
    }
  }

  /** @param {ReturnType<typeof store.claimNext>} job */
  async function processClaimedJob(job) {
    try {
      const handler = handlers[job.type];
      if (!handler) {
        logger.warn?.({ type: job.type }, 'durableQueue:drop reason=no_handler');
        store.ack(job.id);
        return;
      }

      const startedAt = Date.now();
      logger.info?.({ type: job.type, attempt: job.attempts + 1 }, 'durableQueue:start');
      await handler(job.payload);
      store.ack(job.id);
      logger.info?.({ type: job.type, durationMs: Date.now() - startedAt }, 'durableQueue:success');
    } catch (err) {
      const nextAttempts = job.attempts + 1;
      const errorMessage =
        err && typeof err === 'object' && 'message' in err
          ? String(err.message)
          : String(err ?? 'unknown');

      if (nextAttempts < job.maxAttempts) {
        const backoffMs = computeBackoffMs({
          attempt: nextAttempts,
          baseDelayMs: job.baseDelayMs,
          maxDelayMs: job.maxDelayMs,
        });
        const nextRunAt = new Date(Date.now() + backoffMs).toISOString();
        store.nack(job.id, { nextRunAt, attempts: nextAttempts, errorMessage, isDead: false });
        logger.warn?.(
          { type: job.type, attempt: nextAttempts, inMs: backoffMs },
          'durableQueue:retry',
        );
      } else {
        store.nack(job.id, { isDead: true, errorMessage });
        logger.warn?.(
          { type: job.type, attempts: nextAttempts, errorMessage },
          'durableQueue:dead',
        );
        try {
          deadLetter?.record({
            type: job.type,
            payload: job.payload,
            errorMessage,
            attempts: nextAttempts,
            enqueuedAt: job.enqueuedAt,
          });
        } catch (dlErr) {
          logger.error?.({ type: job.type, err: dlErr }, 'durableQueue:dead_letter_store_failed');
        }
      }
    }
  }

  /**
   * Queue depth snapshot for monitoring (#930): counts pending/running jobs
   * and the dead-letter backlog directly from the store.
   */
  function getStatus() {
    return {
      pending: store.countByStatus('pending'),
      running: store.countByStatus('running'),
      dead: store.countDead(),
    };
  }

  return { enqueue, start, stop, getStatus };
}

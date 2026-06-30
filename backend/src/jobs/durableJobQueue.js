// @ts-check
import { randomUUID } from 'node:crypto';
import { computeBackoffMs } from './jobRunner.js';

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
    });
    // Fire a poll without awaiting — safe since processNext is guarded by `processing`
    processNext().catch((err) => logger.error?.('durableQueue:processNext_error', err));
  }

  /** Start the poll loop and recover any stale jobs from a previous crash. */
  function start() {
    const recovered = store.recoverStale(visibilityTimeoutMs);
    if (recovered > 0) {
      logger.info?.(`durableQueue:recovered stale_jobs=${recovered}`);
    }
    pollTimer = setInterval(() => {
      processNext().catch((err) => logger.error?.('durableQueue:poll_error', err));
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

      const handler = handlers[job.type];
      if (!handler) {
        logger.warn?.(`durableQueue:drop type=${job.type} reason=no_handler`);
        store.ack(job.id);
        return;
      }

      const startedAt = Date.now();
      logger.info?.(`durableQueue:start type=${job.type} attempt=${job.attempts + 1}`);
      await handler(job.payload);
      store.ack(job.id);
      logger.info?.(`durableQueue:success type=${job.type} duration_ms=${Date.now() - startedAt}`);
    } catch (err) {
      if (!job) return;
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
          `durableQueue:retry type=${job.type} attempt=${nextAttempts} in_ms=${backoffMs}`,
        );
      } else {
        store.nack(job.id, { isDead: true, errorMessage });
        logger.warn?.(
          `durableQueue:dead type=${job.type} attempts=${nextAttempts} error=${errorMessage}`,
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
          logger.error?.(`durableQueue:dead_letter_store_failed type=${job.type}`, dlErr);
        }
      }
    } finally {
      processing = false;
    }
  }

  return { enqueue, start, stop };
}

import { getRequestId, runWithRequestId } from '../lib/requestContext.js';

function computeBackoffMs({ attempt, baseDelayMs, maxDelayMs }) {
  const jitter = Math.floor(Math.random() * 250);
  const delay = baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(delay + jitter, maxDelayMs);
}

export function createJobRunner({
  handlers = {},
  logger = console,
  timeProvider = { now: () => Date.now() },
  deadLetter,
  lockProvider,
  lockMissDelayMs = 5_000,
  defaultMaxAttempts = 5,
  defaultBaseDelayMs = 1_000,
  defaultMaxDelayMs = 30_000,
} = {}) {
  let timer = null;
  let running = false;
  let stopped = false;
  const queue = [];

  function sortQueue() {
    queue.sort((a, b) => a.runAt - b.runAt);
  }

  function scheduleNext() {
    if (stopped || running) return;
    if (timer) clearTimeout(timer);
    if (queue.length === 0) return;

    sortQueue();
    const next = queue[0];
    const delay = Math.max(0, next.runAt - timeProvider.now());
    timer = setTimeout(runNext, delay);
  }

  function recordDeadLetter(job, error) {
    if (!deadLetter || typeof deadLetter.record !== 'function') {
      logger.error?.(
        { type: job.type, attempts: job.attempt, err: error },
        'job:dead_letter (no persistent store configured)',
      );
      return;
    }

    try {
      deadLetter.record({
        type: job.type,
        payload: job.payload,
        errorMessage:
          error && typeof error === 'object' && 'message' in error
            ? String(/** @type {{ message: unknown }} */ (error).message)
            : String(error ?? 'unknown error'),
        attempts: job.attempt,
        enqueuedAt:
          typeof job.enqueuedAt === 'number' ? new Date(job.enqueuedAt).toISOString() : null,
      });
    } catch (storeError) {
      logger.error?.({ type: job.type, err: storeError }, 'job:dead_letter_store_failed');
    }
  }

  /** The actual per-job work, run inside the job's correlation context (#925). */
  async function processJob(job) {
    const handler = handlers[job.type];

    if (!handler) {
      logger.warn?.({ type: job.type }, 'job:drop reason=no_handler');
      scheduleNext();
      return;
    }

    // Acquire distributed lock before marking running. If the lock is held by
    // another instance, requeue without consuming an attempt and return early
    // so `running` is never set to true.
    let lock = null;
    if (lockProvider) {
      try {
        lock = await lockProvider.acquire(job.type);
      } catch (lockErr) {
        logger.warn?.({ type: job.type, err: lockErr }, 'job:lock_error');
      }
      if (lock === null) {
        queue.push({ ...job, runAt: timeProvider.now() + lockMissDelayMs });
        logger.info?.({ type: job.type, requeueInMs: lockMissDelayMs }, 'job:lock_miss');
        scheduleNext();
        return;
      }
    }

    running = true;
    const startedAt = timeProvider.now();

    try {
      logger.info?.({ type: job.type, attempt: job.attempt }, 'job:start');
      await handler(job.payload);
      logger.info?.({ type: job.type, durationMs: timeProvider.now() - startedAt }, 'job:success');
    } catch (error) {
      const attemptsRemaining = job.maxAttempts - job.attempt;
      logger.warn?.(
        { type: job.type, attempt: job.attempt, remaining: attemptsRemaining, err: error },
        'job:fail',
      );

      if (job.attempt < job.maxAttempts) {
        const backoffMs = computeBackoffMs({
          attempt: job.attempt,
          baseDelayMs: job.baseDelayMs,
          maxDelayMs: job.maxDelayMs,
        });
        queue.push({
          ...job,
          attempt: job.attempt + 1,
          runAt: timeProvider.now() + backoffMs,
        });
        logger.info?.({ type: job.type, inMs: backoffMs }, 'job:retry');
      } else {
        recordDeadLetter(job, error);
      }
    } finally {
      if (lockProvider && lock !== null) {
        await lockProvider
          .release(job.type, lock)
          .catch((err) => logger.warn?.({ type: job.type, err }, 'job:lock_release_failed'));
      }
      running = false;
      scheduleNext();
    }
  }

  async function runNext() {
    if (stopped || running) return;
    if (queue.length === 0) return;

    sortQueue();
    const job = queue.shift();
    // Re-establish the enqueuing request's correlation ID (or mint a fresh
    // one, e.g. for cron-triggered jobs) so every log line for this job run
    // — including ones from deep inside the handler — carries it (#925).
    return runWithRequestId(job.requestId, () => processJob(job));
  }

  function enqueue(
    type,
    payload,
    {
      runAt = timeProvider.now(),
      maxAttempts = defaultMaxAttempts,
      baseDelayMs = defaultBaseDelayMs,
      maxDelayMs = defaultMaxDelayMs,
    } = {},
  ) {
    if (stopped) return;
    queue.push({
      id: `${type}:${Math.random().toString(16).slice(2)}`,
      type,
      payload,
      attempt: 1,
      maxAttempts,
      baseDelayMs,
      maxDelayMs,
      runAt,
      enqueuedAt: timeProvider.now(),
      // Captured from the enqueuing call's context (#925) — null if enqueue()
      // was called outside any tracked context (e.g. an interval timer).
      requestId: getRequestId(),
    });
    scheduleNext();
  }

  function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    queue.length = 0;
  }

  scheduleNext();

  /**
   * Queue depth snapshot for monitoring (#930): jobs waiting in-memory plus
   * whether the runner is currently executing one.
   */
  function getStatus() {
    return { queued: queue.length, running: running ? 1 : 0 };
  }

  return {
    enqueue,
    stop,
    getStatus,
    // Exposed so callers (e.g. an admin "retry from dead-letter" endpoint)
    // can rebuild a job after an operator reviews it.
    _computeBackoffMs: computeBackoffMs,
  };
}

export { computeBackoffMs };

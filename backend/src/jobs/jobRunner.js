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
        `job:dead_letter type=${job.type} attempts=${job.attempt} (no persistent store configured)`,
        error,
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
      logger.error?.(
        `job:dead_letter_store_failed type=${job.type} reason=${storeError?.message ?? storeError}`,
      );
    }
  }

  async function runNext() {
    if (stopped || running) return;
    if (queue.length === 0) return;

    sortQueue();
    const job = queue.shift();
    const handler = handlers[job.type];

    if (!handler) {
      logger.warn?.(`job:drop type=${job.type} reason=no_handler`);
      scheduleNext();
      return;
    }

    running = true;
    const startedAt = timeProvider.now();

    try {
      logger.info?.(`job:start type=${job.type} attempt=${job.attempt}`);
      await handler(job.payload);
      logger.info?.(`job:success type=${job.type} duration_ms=${timeProvider.now() - startedAt}`);
    } catch (error) {
      const attemptsRemaining = job.maxAttempts - job.attempt;
      logger.warn?.(
        `job:fail type=${job.type} attempt=${job.attempt} remaining=${attemptsRemaining}`,
        error,
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
        logger.info?.(`job:retry type=${job.type} in_ms=${backoffMs}`);
      } else {
        recordDeadLetter(job, error);
      }
    } finally {
      running = false;
      scheduleNext();
    }
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

  return {
    enqueue,
    stop,
    // Exposed so callers (e.g. an admin "retry from dead-letter" endpoint)
    // can rebuild a job after an operator reviews it.
    _computeBackoffMs: computeBackoffMs,
  };
}

export { computeBackoffMs };

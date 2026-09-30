import { log as logger } from '../middleware/logger.js';

let sentryClient = null;

async function initializeSentry() {
  const sentryDsn = process.env.SENTRY_DSN;
  const environment = process.env.NODE_ENV || 'development';
  const release = process.env.RELEASE_VERSION || 'unknown';

  if (!sentryDsn) {
    logger.info('[sentry] SENTRY_DSN not configured, monitoring disabled');
    return null;
  }

  try {
    const Sentry = await import('@sentry/node');
    const sourceMapSupport = await import('source-map-support');

    sourceMapSupport.install();

    Sentry.init({
      dsn: sentryDsn,
      environment,
      release,
      tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE
        ? parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE)
        : 0.1,
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.OnUncaughtException(),
        new Sentry.Integrations.OnUnhandledRejection(),
      ],
      beforeSend(event, hint) {
        if (process.env.NODE_ENV === 'test') {
          return null;
        }
        return event;
      },
    });

    logger.info(
      { environment, release },
      '[sentry] Initialized with error monitoring enabled',
    );
    return Sentry;
  } catch (error) {
    logger.warn({ err: error }, '[sentry] Failed to initialize Sentry');
    return null;
  }
}

export async function setupSentry() {
  sentryClient = await initializeSentry();
  return sentryClient;
}

export function getSentry() {
  return sentryClient;
}

export function captureException(error, context = {}) {
  if (!sentryClient) return;
  try {
    sentryClient.captureException(error, { contexts: { app: context } });
  } catch (err) {
    logger.error({ err }, '[sentry] Failed to capture exception');
  }
}

export function captureMessage(message, level = 'info', context = {}) {
  if (!sentryClient) return;
  try {
    sentryClient.captureMessage(message, level, { contexts: { app: context } });
  } catch (err) {
    logger.error({ err }, '[sentry] Failed to capture message');
  }
}

export function withErrorBoundary(fn, contextLabel = 'unknown') {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      captureException(error, { context: contextLabel });
      throw error;
    }
  };
}

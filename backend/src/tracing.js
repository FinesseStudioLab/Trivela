/**
 * OpenTelemetry tracing bootstrap (#288).
 *
 * Initializes the OTel SDK with HTTP + Express auto-instrumentation
 * and an OTLP exporter. In dev (no `OTEL_EXPORTER_OTLP_ENDPOINT`), the
 * SDK still starts but emits no spans to a backend — useful because
 * code that creates manual spans continues to work without `if (tracer)`
 * guards.
 *
 * Manual spans live alongside the call sites that need them — DB
 * queries, Soroban RPC calls, job runner steps — via the exported
 * `withSpan()` helper.
 *
 * Trace context is propagated to outbound HTTP via the auto-
 * instrumented `fetch` / `http` modules. Inbound HTTP requests have
 * their `traceparent` header parsed automatically, and the response
 * exposes `traceparent` in `Access-Control-Expose-Headers` so the
 * frontend can stitch its own span graph.
 *
 * Environment variables (documented in backend/.env.example):
 *   OTEL_SERVICE_NAME            — service name in traces (default "trivela-backend")
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — OTLP/HTTP endpoint (e.g. http://jaeger:4318)
 *   OTEL_EXPORTER_OTLP_HEADERS   — comma-separated key=value auth headers
 *   OTEL_TRACES_SAMPLER_ARG      — 0..1 sampler ratio (default 1.0 = sample all)
 *
 * Call `initTracing()` ONCE at the top of `index.js` BEFORE any other
 * import that pulls in `http` / `express`, otherwise the
 * auto-instrumentation patches miss the loaded modules.
 */

import { trace, SpanStatusCode, context as otelContext } from '@opentelemetry/api';

let sdkInstance = null;

/**
 * Lazily-loaded SDK initializer. Returns the configured tracer or a
 * no-op tracer when the SDK packages aren't installed (e.g. in
 * tests that don't pull in the OTel deps).
 */
export async function initTracing() {
  if (sdkInstance !== null) {
    return sdkInstance;
  }

  const serviceName = process.env.OTEL_SERVICE_NAME || 'trivela-backend';
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  try {
    // Dynamic imports so the rest of the backend can run even when
    // the OTel optional-deps haven't been installed yet (CI without
    // the tracing extras still boots).
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const { HttpInstrumentation } = await import('@opentelemetry/instrumentation-http');
    const { ExpressInstrumentation } = await import('@opentelemetry/instrumentation-express');
    const { Resource } = await import('@opentelemetry/resources');
    const { SemanticResourceAttributes } = await import('@opentelemetry/semantic-conventions');

    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || 'unknown',
    });

    const exporter = endpoint
      ? new OTLPTraceExporter({
          url: `${endpoint.replace(/\/$/, '')}/v1/traces`,
          headers: parseOtlpHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
        })
      : undefined;

    sdkInstance = new NodeSDK({
      resource,
      traceExporter: exporter,
      instrumentations: [
        new HttpInstrumentation({
          // Don't trace healthchecks — they'd swamp the trace stream
          // with no signal. The bare /health endpoint is enough to
          // catch outages via the Prometheus `/metrics` channel.
          ignoreIncomingRequestHook(req) {
            return req.url === '/health' || req.url === '/metrics';
          },
        }),
        new ExpressInstrumentation(),
      ],
    });
    sdkInstance.start();
    // eslint-disable-next-line no-console
    console.log(
      `[tracing] OpenTelemetry SDK started (service=${serviceName}, exporter=${endpoint || 'noop'})`,
    );
    return sdkInstance;
  } catch (err) {
    // Soft-fail: the rest of the backend keeps running. `withSpan()`
    // falls through to a no-op tracer below.
    // eslint-disable-next-line no-console
    console.warn(
      `[tracing] OpenTelemetry SDK not available (${err.message}); continuing without tracing`,
    );
    sdkInstance = false;
    return null;
  }
}

function parseOtlpHeaders(raw) {
  if (!raw) return {};
  const out = {};
  for (const part of raw.split(',')) {
    const [k, ...rest] = part.split('=');
    if (k && rest.length > 0) {
      out[k.trim()] = rest.join('=').trim();
    }
  }
  return out;
}

/**
 * Run `fn` inside a span. Captures errors as span events and re-throws.
 * Use at boundaries where the auto-instrumentation doesn't already
 * give you a span: DB queries, Soroban RPC calls, job runner ticks.
 *
 * @example
 *   await withSpan('soroban.invoke', { contractId, method }, async (span) => {
 *     span.setAttribute('payload.size', body.length);
 *     return await rpc.invoke(...);
 *   });
 */
export async function withSpan(name, attributes, fn) {
  const tracer = trace.getTracer('trivela-backend');
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Express middleware that exposes the active span's `traceparent`
 * via a response header so a frontend instrumentation can stitch
 * its own spans into the same trace.
 */
export function traceparentMiddleware() {
  return function traceparent(req, res, next) {
    const span = trace.getSpan(otelContext.active());
    if (span) {
      const ctx = span.spanContext();
      // W3C Trace Context format: version-traceId-spanId-flags
      const flags = ctx.traceFlags.toString(16).padStart(2, '0');
      res.setHeader('traceparent', `00-${ctx.traceId}-${ctx.spanId}-${flags}`);
    }
    next();
  };
}

/** Headers to expose so a browser fetch can read the traceparent. */
export const TRACING_EXPOSED_HEADERS = ['traceparent'];

/** Graceful shutdown hook — flush exporter on SIGTERM. */
export async function shutdownTracing() {
  if (sdkInstance && typeof sdkInstance.shutdown === 'function') {
    try {
      await sdkInstance.shutdown();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[tracing] shutdown failed: ${err.message}`);
    }
  }
}

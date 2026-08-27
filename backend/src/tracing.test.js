import test from 'node:test';
import assert from 'node:assert/strict';
import { trace, context as otelContext } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { captureTraceparent, linkedSpan } from './tracing.js';

/**
 * Trace assertion test for issue #778: confirms `captureTraceparent()` +
 * `linkedSpan()` correctly re-link a span across an async boundary — the
 * exact shape of the outbox relay's write-now/deliver-later gap, where
 * OTel's automatic context propagation can't reach on its own since the
 * delivery happens on a completely separate event-loop tick with no
 * ambient span.
 */

function setupInMemoryTracing() {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
  return { provider, exporter };
}

test('linkedSpan re-establishes parent/child across an async boundary', async () => {
  const { provider, exporter } = setupInMemoryTracing();
  try {
    const tracer = trace.getTracer('test');

    // Simulate the HTTP request that enqueues the outbox row: start a span,
    // capture its traceparent (what writeOutbox stores alongside the row),
    // then end the span — mirroring the request finishing well before the
    // relay ever picks the row up.
    let traceparent;
    let parentSpanId;
    let parentTraceId;
    await tracer.startActiveSpan('http.request', async (parentSpan) => {
      const ctx = parentSpan.spanContext();
      parentSpanId = ctx.spanId;
      parentTraceId = ctx.traceId;
      traceparent = captureTraceparent();
      parentSpan.end();
    });

    assert.ok(traceparent, 'expected a traceparent to be captured from the active span');

    // Simulate the relay's later, unrelated poll tick: no ambient span here
    // at all — linkedSpan must reconstruct the parent purely from the
    // stored traceparent string.
    await otelContext.with(otelContext.active(), async () => {
      await linkedSpan(traceparent, 'outbox.deliver', { 'outbox.event_type': 'test.event' }, async () => {
        // handler body — nothing to do for this assertion.
      });
    });

    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();
    const deliverSpan = spans.find((s) => s.name === 'outbox.deliver');

    assert.ok(deliverSpan, 'expected an outbox.deliver span to have been recorded');
    assert.equal(
      deliverSpan.parentSpanId,
      parentSpanId,
      'outbox.deliver span must be a child of the request span that enqueued it',
    );
    assert.equal(
      deliverSpan.spanContext().traceId,
      parentTraceId,
      'outbox.deliver span must share the same trace id as the request that enqueued it',
    );
  } finally {
    await provider.shutdown();
  }
});

test('linkedSpan still traces (unlinked) when no traceparent is available', async () => {
  const { provider, exporter } = setupInMemoryTracing();
  try {
    await linkedSpan(null, 'outbox.deliver', {}, async () => {});
    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();
    const deliverSpan = spans.find((s) => s.name === 'outbox.deliver');
    assert.ok(deliverSpan, 'expected a span even without a traceparent to link to');
    assert.equal(deliverSpan.parentSpanId, undefined, 'span should have no parent when unlinked');
  } finally {
    await provider.shutdown();
  }
});

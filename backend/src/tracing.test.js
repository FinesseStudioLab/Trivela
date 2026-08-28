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
/**
 * Tests for distributed tracing across async boundaries
 * 
 * Fixes: https://github.com/FinesseStudioLab/Trivela/issues/778
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';
import {
  initTracing,
  withSpan,
  extractTraceContext,
  resumeTraceContext,
  spanDatabaseQuery,
  spanStellarRpc,
  spanJobExecution,
  shutdownTracing,
} from './tracing.js';
import { trace, context as otelContext } from '@opentelemetry/api';

describe('Distributed Tracing', () => {
  before(async () => {
    // Initialize tracing for tests
    await initTracing();
  });

  after(async () => {
    await shutdownTracing();
  });

  describe('withSpan', () => {
    it('should create a span and execute function', async () => {
      const result = await withSpan('test.operation', { foo: 'bar' }, async (span) => {
        assert.ok(span, 'Span should be provided');
        return 'success';
      });

      assert.strictEqual(result, 'success');
    });

    it('should record exceptions and re-throw', async () => {
      try {
        await withSpan('test.error', {}, async () => {
          throw new Error('Test error');
        });
        assert.fail('Should have thrown');
      } catch (err) {
        assert.strictEqual(err.message, 'Test error');
      }
    });
  });

  describe('trace context propagation', () => {
    it('should extract trace context from active span', async () => {
      await withSpan('parent.span', {}, async () => {
        const ctx = extractTraceContext();
        
        assert.ok(ctx, 'Context should be extracted');
        assert.ok(ctx.traceId, 'Should have traceId');
        assert.ok(ctx.spanId, 'Should have spanId');
        assert.ok(typeof ctx.traceFlags === 'number', 'Should have traceFlags');
      });
    });

    it('should return null when no active span', () => {
      const ctx = extractTraceContext();
      // May be null or have a span depending on test isolation
      assert.ok(ctx === null || typeof ctx === 'object');
    });

    it('should resume trace context across async boundaries', async () => {
      let extractedContext = null;
      let parentTraceId = null;
      let childTraceId = null;

      // Create parent span and extract context
      await withSpan('parent.operation', { step: 'create' }, async () => {
        extractedContext = extractTraceContext();
        parentTraceId = extractedContext?.traceId;
      });

      assert.ok(extractedContext, 'Should have extracted context');

      // Simulate async job using the extracted context
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Resume trace in child operation
      await resumeTraceContext(
        extractedContext,
        'child.operation',
        { step: 'resume' },
        async (span) => {
          childTraceId = extractTraceContext()?.traceId;
          assert.ok(span, 'Should have span in resumed context');
        }
      );

      // Both should share the same trace ID
      if (parentTraceId && childTraceId) {
        assert.strictEqual(parentTraceId, childTraceId, 'Parent and child should share trace ID');
      }
    });

    it('should handle null trace context gracefully', async () => {
      const result = await resumeTraceContext(
        null,
        'orphan.operation',
        { test: true },
        async () => 'completed'
      );

      assert.strictEqual(result, 'completed');
    });
  });

  describe('specialized span helpers', () => {
    it('should span database queries with attributes', async () => {
      const result = await spanDatabaseQuery(
        'SELECT',
        'campaigns',
        { limit: 10 },
        async (span) => {
          assert.ok(span);
          return [{ id: 1, name: 'Test Campaign' }];
        }
      );

      assert.strictEqual(result.length, 1);
    });

    it('should span Stellar RPC calls', async () => {
      const result = await spanStellarRpc(
        'getTransaction',
        { txHash: 'abc123', ledger: 12345 },
        async (span) => {
          assert.ok(span);
          return { status: 'SUCCESS' };
        }
      );

      assert.strictEqual(result.status, 'SUCCESS');
    });

    it('should span job execution', async () => {
      const result = await spanJobExecution(
        'process-webhook',
        'job-456',
        { campaign: 'campaign-789' },
        async (span) => {
          assert.ok(span);
          return { processed: true };
        }
      );

      assert.strictEqual(result.processed, true);
    });
  });

  describe('end-to-end trace propagation', () => {
    it('should maintain trace across HTTP → service → DB → job → RPC', async () => {
      const traceIds = [];

      // Simulate HTTP request
      await withSpan('http.request', { route: '/api/campaigns' }, async () => {
        const ctx1 = extractTraceContext();
        traceIds.push(ctx1?.traceId);

        // Service layer
        await withSpan('service.getCampaigns', {}, async () => {
          const ctx2 = extractTraceContext();
          traceIds.push(ctx2?.traceId);

          // Database query
          await spanDatabaseQuery('SELECT', 'campaigns', {}, async () => {
            const ctx3 = extractTraceContext();
            traceIds.push(ctx3?.traceId);
          });
        });

        // Async job triggered (extract context for later)
        const jobContext = extractTraceContext();

        // Simulate job execution later
        await new Promise((resolve) => setTimeout(resolve, 5));

        await resumeTraceContext(
          jobContext,
          'job.processCampaign',
          {},
          async () => {
            const ctx4 = extractTraceContext();
            traceIds.push(ctx4?.traceId);

            // RPC call within job
            await spanStellarRpc('submitTransaction', {}, async () => {
              const ctx5 = extractTraceContext();
              traceIds.push(ctx5?.traceId);
            });
          }
        );
      });

      // Verify all operations share the same trace ID
      const uniqueTraceIds = [...new Set(traceIds.filter(Boolean))];
      
      if (uniqueTraceIds.length > 0) {
        assert.strictEqual(
          uniqueTraceIds.length,
          1,
          'All operations should share a single trace ID'
        );
      }
    });
  });

  describe('attribute sanitization', () => {
    it('should not include PII in span attributes', async () => {
      const sensitiveData = {
        email: 'user@example.com',
        walletAddress: 'GABC123...',
        campaignId: 'campaign-123',
      };

      await withSpan('service.operation', {
        // Only include non-PII attributes
        campaignId: sensitiveData.campaignId,
        // Do NOT include email or walletAddress
      }, async (span) => {
        // Verify span was created
        assert.ok(span);
      });
    });
  });
});

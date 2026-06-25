// Tests for the real-time subscription client (#626): event dispatch, id
// de-duplication, exponential-backoff reconnect, and clean teardown.
//
// Located under src/hooks/ to match the vitest `include` glob so it runs in CI.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRealtimeSubscription } from '../lib/realtimeClient';

class MockEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.closed = false;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  // ── test helpers ──
  open() {
    this.onopen?.({});
  }

  message(payload, lastEventId) {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    this.onmessage?.({ data, lastEventId });
  }

  error() {
    this.onerror?.({});
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
});

function subscribe(overrides = {}) {
  const events = [];
  const statuses = [];
  const handle = createRealtimeSubscription({
    url: 'http://stream.local/campaigns/1',
    EventSourceImpl: MockEventSource,
    onEvent: (e) => events.push(e),
    onStatusChange: (s) => statuses.push(s),
    baseDelayMs: 100,
    maxDelayMs: 1000,
    ...overrides,
  });
  return { handle, events, statuses };
}

describe('createRealtimeSubscription', () => {
  it('connects, reports open, and dispatches parsed events', () => {
    const { events, statuses } = subscribe();
    const es = MockEventSource.instances[0];

    expect(statuses[0]).toBe('connecting');
    es.open();
    expect(statuses).toContain('open');

    es.message({ id: 'e1', type: 'campaign.updated', data: { participantCount: 7 } });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      id: 'e1',
      type: 'campaign.updated',
      data: { participantCount: 7 },
    });
  });

  it('de-duplicates events by id (idempotent against replays)', () => {
    const { events } = subscribe();
    const es = MockEventSource.instances[0];
    es.open();

    es.message({ id: 'dup', data: { participantCount: 1 } });
    es.message({ id: 'dup', data: { participantCount: 1 } }); // replay
    es.message({ id: 'next', data: { participantCount: 2 } });

    expect(events.map((e) => e.id)).toEqual(['dup', 'next']);
  });

  it('ignores non-JSON payloads (keep-alives/comments)', () => {
    const { events } = subscribe();
    const es = MockEventSource.instances[0];
    es.open();
    es.message(':keep-alive');
    expect(events).toHaveLength(0);
  });

  it('reconnects with capped exponential backoff after an error', () => {
    vi.useFakeTimers();
    const { statuses } = subscribe();
    expect(MockEventSource.instances).toHaveLength(1);

    // First drop → reconnect after baseDelay (100ms).
    MockEventSource.instances[0].error();
    expect(statuses).toContain('reconnecting');
    vi.advanceTimersByTime(99);
    expect(MockEventSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(MockEventSource.instances).toHaveLength(2);

    // Second drop → delay doubles to 200ms.
    MockEventSource.instances[1].error();
    vi.advanceTimersByTime(199);
    expect(MockEventSource.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockEventSource.instances).toHaveLength(3);
  });

  it('resets the backoff after a successful reconnect', () => {
    vi.useFakeTimers();
    subscribe();
    MockEventSource.instances[0].error();
    vi.advanceTimersByTime(100);
    expect(MockEventSource.instances).toHaveLength(2);
    MockEventSource.instances[1].open(); // success resets attempts

    MockEventSource.instances[1].error();
    // Back to the base delay, not the doubled one.
    vi.advanceTimersByTime(100);
    expect(MockEventSource.instances).toHaveLength(3);
  });

  it('close() tears down the source and stops reconnecting', () => {
    vi.useFakeTimers();
    const { handle, statuses } = subscribe();
    const es = MockEventSource.instances[0];

    handle.close();
    expect(es.closed).toBe(true);
    expect(statuses[statuses.length - 1]).toBe('closed');

    // A late error after close must not schedule a reconnect.
    es.error();
    vi.advanceTimersByTime(5000);
    expect(MockEventSource.instances).toHaveLength(1);
  });

  it('throws when constructed without a url or EventSource impl', () => {
    expect(() => createRealtimeSubscription({ EventSourceImpl: MockEventSource })).toThrow(/url/);
    expect(() => createRealtimeSubscription({ url: 'x', EventSourceImpl: undefined })).toThrow(
      /EventSource/,
    );
  });
});

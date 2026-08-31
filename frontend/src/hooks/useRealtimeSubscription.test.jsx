// Tests for the useRealtimeSubscription React wrapper (#626).

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useRealtimeSubscription } from './useRealtimeSubscription';

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

  open() {
    this.onopen?.({});
  }

  message(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
});

describe('useRealtimeSubscription', () => {
  it('stays idle when disabled or given no url', () => {
    const { result } = renderHook(() =>
      useRealtimeSubscription({ url: '', enabled: true, EventSourceImpl: MockEventSource }),
    );
    expect(result.current.status).toBe('idle');
    expect(result.current.isLive).toBe(false);
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('connects when enabled and reports live on open', () => {
    const { result } = renderHook(() =>
      useRealtimeSubscription({
        url: 'http://stream.local/1',
        enabled: true,
        EventSourceImpl: MockEventSource,
      }),
    );

    expect(MockEventSource.instances).toHaveLength(1);
    expect(result.current.status).toBe('connecting');

    act(() => MockEventSource.instances[0].open());
    expect(result.current.isLive).toBe(true);
    expect(result.current.status).toBe('open');
  });

  it('forwards parsed events to onEvent', () => {
    const received = [];
    renderHook(() =>
      useRealtimeSubscription({
        url: 'http://stream.local/1',
        enabled: true,
        EventSourceImpl: MockEventSource,
        onEvent: (e) => received.push(e),
      }),
    );

    act(() => {
      MockEventSource.instances[0].open();
      MockEventSource.instances[0].message({ id: 'a', data: { participantCount: 5 } });
    });

    expect(received).toHaveLength(1);
    expect(received[0].data).toEqual({ participantCount: 5 });
  });

  it('closes the subscription on unmount', () => {
    const { unmount } = renderHook(() =>
      useRealtimeSubscription({
        url: 'http://stream.local/1',
        enabled: true,
        EventSourceImpl: MockEventSource,
      }),
    );
    const es = MockEventSource.instances[0];
    expect(es.closed).toBe(false);
    unmount();
    expect(es.closed).toBe(true);
  });
});

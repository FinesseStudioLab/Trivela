// @vitest-environment jsdom
// Tests for the VirtualizedList windowing component (issue #629).

import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import VirtualizedList from './VirtualizedList';

afterEach(cleanup);

const makeItems = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));

// jsdom has no layout, so give @tanstack/react-virtual real element sizes and a
// ResizeObserver to measure against — otherwise it renders nothing and the
// windowing behaviour can't be observed.
const origResizeObserver = globalThis.ResizeObserver;
const origGetRect = Element.prototype.getBoundingClientRect;

const origOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
const origOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');

beforeAll(() => {
  globalThis.ResizeObserver = class {
    constructor(cb) {
      this.cb = cb;
    }
    observe() {
      if (this.cb) this.cb([]);
    }
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      width: 600,
      height: 600,
      top: 0,
      left: 0,
      right: 600,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  };
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 600,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 600,
  });
});

afterAll(() => {
  globalThis.ResizeObserver = origResizeObserver;
  Element.prototype.getBoundingClientRect = origGetRect;
  if (origOffsetHeight)
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', origOffsetHeight);
  if (origOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', origOffsetWidth);
});

describe('VirtualizedList', () => {
  it('windows large datasets: only a small subset of rows is in the DOM', () => {
    render(
      <VirtualizedList
        items={makeItems(10000)}
        getKey={(it) => it.id}
        getItemProps={() => ({ 'data-testid': 'row' })}
        renderItem={(it) => <span>row {it.id}</span>}
      />,
    );

    const rendered = screen.queryAllByTestId('row');
    expect(rendered.length).toBeGreaterThan(0);
    // A handful of overscanned rows — never the full 10k.
    expect(rendered.length).toBeLessThan(200);
  });

  it('renders every row when the dataset fits', () => {
    render(
      <VirtualizedList
        items={makeItems(4)}
        getKey={(it) => it.id}
        getItemProps={() => ({ 'data-testid': 'row' })}
        renderItem={(it) => <span>row {it.id}</span>}
      />,
    );

    expect(screen.queryAllByTestId('row')).toHaveLength(4);
  });

  it('applies item props (role / aria) to each row for accessibility', () => {
    render(
      <VirtualizedList
        items={makeItems(3)}
        getKey={(it) => it.id}
        getItemProps={(_, i) => ({ role: 'row', 'aria-rowindex': i + 2, 'data-testid': 'row' })}
        renderItem={(it) => <span>row {it.id}</span>}
      />,
    );

    const rows = screen.queryAllByTestId('row');
    expect(rows[0].getAttribute('role')).toBe('row');
    expect(rows[0].getAttribute('aria-rowindex')).toBe('2');
  });

  it('fires onReachEnd for infinite scroll when the end is in view', () => {
    const onReachEnd = vi.fn();
    render(
      <VirtualizedList
        items={makeItems(5)}
        getKey={(it) => it.id}
        renderItem={(it) => <span>row {it.id}</span>}
        onReachEnd={onReachEnd}
      />,
    );

    expect(onReachEnd).toHaveBeenCalled();
  });
});

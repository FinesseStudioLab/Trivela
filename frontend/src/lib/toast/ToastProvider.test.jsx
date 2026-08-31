import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ToastProvider, useToast } from './ToastProvider';

function wrapper({ children }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe('ToastProvider / useToast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('show() adds a toast and returns its id', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    let id;
    act(() => {
      id = result.current.show('Hello', { type: 'info', duration: 0 });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({ id, message: 'Hello', type: 'info' });
  });

  it('success/error/info set the right type', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.success('ok', { duration: 0 });
      result.current.error('bad', { duration: 0 });
      result.current.info('fyi', { duration: 0 });
    });

    expect(result.current.toasts.map((t) => t.type)).toEqual(['success', 'error', 'info']);
  });

  it('dismiss(id) removes a specific toast', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    let firstId;
    act(() => {
      firstId = result.current.show('first', { duration: 0 });
      result.current.show('second', { duration: 0 });
    });
    expect(result.current.toasts).toHaveLength(2);

    act(() => {
      result.current.dismiss(firstId);
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('second');
  });

  it('auto-dismisses after the given duration', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.show('temp', { duration: 1000 });
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('does not auto-dismiss when duration is 0', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.show('sticky', { duration: 0 });
    });

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current.toasts).toHaveLength(1);
  });
});

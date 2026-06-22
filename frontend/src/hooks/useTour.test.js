import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTour } from './useTour.js';

const STORAGE_KEY = 'trivela:tour_completed';

describe('useTour', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows the tour on first visit (no storage key)', () => {
    const { result } = renderHook(() => useTour());
    expect(result.current.shouldShow).toBe(true);
    expect(result.current.isComplete).toBe(false);
  });

  it('does not show the tour when already completed', () => {
    window.localStorage.setItem(STORAGE_KEY, '1');
    const { result } = renderHook(() => useTour());
    expect(result.current.shouldShow).toBe(false);
  });

  it('markComplete hides the tour and sets the storage key', () => {
    const { result } = renderHook(() => useTour());
    expect(result.current.shouldShow).toBe(true);

    act(() => {
      result.current.markComplete();
    });

    expect(result.current.shouldShow).toBe(false);
    expect(result.current.isComplete).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');
  });

  it('restartTour removes the storage key and shows the tour again', () => {
    window.localStorage.setItem(STORAGE_KEY, '1');
    const { result } = renderHook(() => useTour());
    expect(result.current.shouldShow).toBe(false);

    act(() => {
      result.current.restartTour();
    });

    expect(result.current.shouldShow).toBe(true);
    expect(result.current.isComplete).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('does not throw when localStorage is unavailable', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(() => renderHook(() => useTour())).not.toThrow();
  });

  it('markComplete does not throw when localStorage write fails', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage full');
    });
    const { result } = renderHook(() => useTour());
    expect(() => {
      act(() => {
        result.current.markComplete();
      });
    }).not.toThrow();
    expect(result.current.shouldShow).toBe(false);
  });

  it('restartTour does not throw when localStorage.removeItem fails', () => {
    window.localStorage.setItem(STORAGE_KEY, '1');
    vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('storage error');
    });
    const { result } = renderHook(() => useTour());
    expect(() => {
      act(() => {
        result.current.restartTour();
      });
    }).not.toThrow();
  });
});

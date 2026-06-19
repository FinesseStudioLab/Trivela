import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import OnboardingTour from '../components/OnboardingTour';

const mockDrive = vi.fn();
const mockDestroy = vi.fn();
const mockMoveNext = vi.fn();
const mockMovePrevious = vi.fn();

vi.mock('driver.js', () => ({
  driver: vi.fn(() => ({
    drive: mockDrive,
    destroy: mockDestroy,
    moveNext: mockMoveNext,
    movePrevious: mockMovePrevious,
  })),
}));

const TOUR_KEY = 'trivela:tour_completed';

describe('OnboardingTour', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not start tour when already completed', () => {
    localStorage.setItem(TOUR_KEY, 'true');
    render(<OnboardingTour />);
    vi.advanceTimersByTime(1000);
    expect(mockDrive).not.toHaveBeenCalled();
  });

  it('starts tour automatically on first visit after delay', () => {
    render(<OnboardingTour />);
    expect(mockDrive).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(mockDrive).toHaveBeenCalledTimes(1);
  });

  it('sets localStorage on tour completion', () => {
    const { driver } = require('driver.js');
    let onDestroyedCallback;
    driver.mockImplementation((config) => {
      onDestroyedCallback = config.onDestroyed;
      return {
        drive: mockDrive,
        destroy: mockDestroy,
        moveNext: mockMoveNext,
        movePrevious: mockMovePrevious,
      };
    });

    render(<OnboardingTour />);
    vi.advanceTimersByTime(600);

    if (onDestroyedCallback) {
      onDestroyedCallback();
    }

    expect(localStorage.getItem(TOUR_KEY)).toBe('true');
  });

  it('renders null - tour overlay is handled by driver.js', () => {
    const { container } = render(<OnboardingTour />);
    expect(container.firstChild).toBeNull();
  });

  it('accepts an onRestart ref to expose restart function', () => {
    const restartRef = { current: null };
    render(<OnboardingTour onRestart={restartRef} />);
    expect(typeof restartRef.current).toBe('function');
  });
});

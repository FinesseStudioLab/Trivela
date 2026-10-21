import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StreakCelebrationModal from './StreakCelebrationModal';
import { isStreakMilestone } from '../utils/streakMilestone';

describe('StreakCelebrationModal', () => {
  it('renders nothing for non-milestone streaks', () => {
    const { container } = render(<StreakCelebrationModal streakDays={3} onClose={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows celebration for 7-day milestone', () => {
    render(<StreakCelebrationModal streakDays={7} onClose={() => {}} />);
    expect(screen.getByTestId('streak-celebration-modal')).toBeDefined();
    expect(screen.getByText('7-Day Streak!')).toBeDefined();
  });

  it('shows celebration for 30-day milestone', () => {
    render(<StreakCelebrationModal streakDays={30} onClose={() => {}} />);
    expect(screen.getByText('30-Day Streak!')).toBeDefined();
  });

  it('calls onClose when the button is clicked', () => {
    const onClose = vi.fn();
    render(<StreakCelebrationModal streakDays={7} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /keep it up/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<StreakCelebrationModal streakDays={7} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('isStreakMilestone', () => {
  it('returns true for 7 and 30', () => {
    expect(isStreakMilestone(7)).toBe(true);
    expect(isStreakMilestone(30)).toBe(true);
  });

  it('returns false for other values', () => {
    expect(isStreakMilestone(5)).toBe(false);
    expect(isStreakMilestone(0)).toBe(false);
    expect(isStreakMilestone(31)).toBe(false);
  });
});

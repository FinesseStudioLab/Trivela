import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SkeletonLoader from './SkeletonLoader';

describe('SkeletonLoader', () => {
  it('renders an accessible loading status', () => {
    render(<SkeletonLoader label="Loading campaigns" />);

    const status = screen.getByRole('status', { name: 'Loading campaigns' });
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(status.textContent).toBe('Loading campaigns');
  });

  it('renders configurable text lines', () => {
    const { container } = render(<SkeletonLoader variant="text" lines={4} />);

    expect(container.querySelectorAll('.skeleton-loader-line')).toHaveLength(4);
  });

  it('renders table rows with a capped row count', () => {
    const { container } = render(<SkeletonLoader variant="table" rows={20} />);

    expect(container.querySelectorAll('.skeleton-loader-table-row')).toHaveLength(13);
  });

  it('renders dashboard cards', () => {
    const { container } = render(<SkeletonLoader variant="dashboard" />);

    expect(container.querySelectorAll('.skeleton-loader-dashboard-card')).toHaveLength(4);
  });
});

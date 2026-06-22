// Unit tests for the CampaignFilters component and its sort-key mapping.
// Follows the existing vitest convention from src/lib/config.test.js — the
// frontend repo wires vitest separately from the Playwright e2e suite.

import { act, render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CampaignFilters, { sortKeyToApiParams } from './CampaignFilters';

describe('sortKeyToApiParams', () => {
  it('maps the UI sort keys to the backend (sort, order) tuple', () => {
    expect(sortKeyToApiParams('newest')).toEqual({ sort: 'created_at', order: 'desc' });
    expect(sortKeyToApiParams('oldest')).toEqual({ sort: 'created_at', order: 'asc' });
    expect(sortKeyToApiParams('name_asc')).toEqual({ sort: 'name', order: 'asc' });
    expect(sortKeyToApiParams('name_desc')).toEqual({ sort: 'name', order: 'desc' });
    expect(sortKeyToApiParams('reward_desc')).toEqual({
      sort: 'reward_per_action',
      order: 'desc',
    });
  });

  it('falls back to newest for unknown keys', () => {
    expect(sortKeyToApiParams('garbage')).toEqual({ sort: 'created_at', order: 'desc' });
    expect(sortKeyToApiParams(undefined)).toEqual({ sort: 'created_at', order: 'desc' });
  });
});

describe('CampaignFilters', () => {
  it('debounces the search input before notifying the parent', async () => {
    vi.useFakeTimers();
    try {
      const onQueryChange = vi.fn();
      render(
        <CampaignFilters
          query=""
          activeOnly={false}
          sortKey="newest"
          onQueryChange={onQueryChange}
          debounceMs={300}
        />,
      );

      const input = screen.getByLabelText(/search campaigns/i);

      act(() => {
        fireEvent.change(input, { target: { value: 'air' } });
      });
      act(() => {
        fireEvent.change(input, { target: { value: 'airdrop' } });
      });

      // Still inside the debounce window — must not have fired yet.
      expect(onQueryChange).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(onQueryChange).toHaveBeenCalledTimes(1);
      expect(onQueryChange).toHaveBeenCalledWith('airdrop');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reflects active-only toggle and sort changes back to the parent immediately', () => {
    const onActiveOnlyChange = vi.fn();
    const onSortKeyChange = vi.fn();

    render(
      <CampaignFilters
        query=""
        activeOnly={false}
        sortKey="newest"
        onActiveOnlyChange={onActiveOnlyChange}
        onSortKeyChange={onSortKeyChange}
      />,
    );

    const toggle = screen.getByLabelText(/active only/i);
    toggle.click();
    expect(onActiveOnlyChange).toHaveBeenCalledWith(true);

    const sortSelect = screen.getByLabelText(/sort/i);
    fireEvent.change(sortSelect, { target: { value: 'reward_desc' } });
    expect(onSortKeyChange).toHaveBeenCalledWith('reward_desc');
  });
});

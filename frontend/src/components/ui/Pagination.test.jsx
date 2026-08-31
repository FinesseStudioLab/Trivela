// Unit tests for the design-system Pagination control (issue #978).
// The windowing maths is tested directly; the component tests cover the
// accessibility contract and the guards around out-of-range input.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import Pagination, { getPageItems, formatRange, ELLIPSIS } from './Pagination.jsx';

describe('getPageItems', () => {
  it('returns an empty list for a non-positive page count', () => {
    expect(getPageItems({ page: 1, pageCount: 0 })).toEqual([]);
    expect(getPageItems({ page: 1, pageCount: Number.NaN })).toEqual([]);
  });

  it('shows every page while the list still fits', () => {
    expect(getPageItems({ page: 3, pageCount: 7 })).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('collapses the tail when the current page is near the start', () => {
    expect(getPageItems({ page: 1, pageCount: 10 })).toEqual([1, 2, 3, 4, 5, ELLIPSIS, 10]);
  });

  it('collapses the head when the current page is near the end', () => {
    expect(getPageItems({ page: 10, pageCount: 10 })).toEqual([1, ELLIPSIS, 6, 7, 8, 9, 10]);
  });

  it('collapses both sides in the middle', () => {
    expect(getPageItems({ page: 10, pageCount: 20 })).toEqual([
      1,
      ELLIPSIS,
      9,
      10,
      11,
      ELLIPSIS,
      20,
    ]);
  });

  it('widens the window as siblingCount grows', () => {
    expect(getPageItems({ page: 10, pageCount: 20, siblingCount: 2 })).toEqual([
      1,
      ELLIPSIS,
      8,
      9,
      10,
      11,
      12,
      ELLIPSIS,
      20,
    ]);
  });

  it('keeps extra boundary pages pinned at both ends', () => {
    expect(getPageItems({ page: 10, pageCount: 20, boundaryCount: 2 })).toEqual([
      1,
      2,
      ELLIPSIS,
      9,
      10,
      11,
      ELLIPSIS,
      19,
      20,
    ]);
  });

  it('clamps an out-of-range page into the list', () => {
    expect(getPageItems({ page: 99, pageCount: 10 })).toEqual(
      getPageItems({ page: 10, pageCount: 10 }),
    );
  });
});

describe('formatRange', () => {
  it('describes the slice of results on screen', () => {
    expect(formatRange({ page: 2, pageSize: 25, totalItems: 340 })).toBe('26–50 of 340');
  });

  it('clips the final page to the true total', () => {
    expect(formatRange({ page: 4, pageSize: 25, totalItems: 80 })).toBe('76–80 of 80');
  });

  it('reports an empty result set', () => {
    expect(formatRange({ page: 1, pageSize: 25, totalItems: 0 })).toBe('No results');
  });

  it('returns nothing without a total to count against', () => {
    expect(formatRange({ page: 1, pageSize: 25 })).toBe('');
    expect(formatRange({ page: 1, pageSize: 0, totalItems: 10 })).toBe('');
  });
});

describe('Pagination', () => {
  it('labels the landmark and marks the current page', () => {
    render(<Pagination page={3} pageCount={10} onPageChange={vi.fn()} />);

    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();

    const current = screen.getByRole('button', { name: 'Page 3, current page' });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Go to page 4' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('emits the requested page number', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={3} pageCount={10} onPageChange={onPageChange} />);

    await user.click(screen.getByRole('button', { name: 'Go to page 4' }));
    expect(onPageChange).toHaveBeenCalledWith(4);

    await user.click(screen.getByRole('button', { name: 'Go to previous page' }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    await user.click(screen.getByRole('button', { name: 'Go to next page' }));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('never re-emits the page already on screen', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={3} pageCount={10} onPageChange={onPageChange} />);

    await user.click(screen.getByRole('button', { name: 'Page 3, current page' }));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('disables the edge controls at the first and last page', () => {
    const { unmount } = render(<Pagination page={1} pageCount={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeEnabled();
    unmount();

    render(<Pagination page={5} pageCount={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled();
  });

  it('adds first/last jumps only when asked', () => {
    const { unmount } = render(<Pagination page={5} pageCount={10} onPageChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Go to first page' })).not.toBeInTheDocument();
    unmount();

    render(<Pagination page={5} pageCount={10} onPageChange={vi.fn()} showFirstLast />);
    expect(screen.getByRole('button', { name: 'Go to first page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to last page' })).toBeInTheDocument();
  });

  it('hides truncation gaps from assistive tech', () => {
    const { container } = render(<Pagination page={10} pageCount={20} onPageChange={vi.fn()} />);

    const gaps = container.querySelectorAll('.ds-pagination__gap');
    expect(gaps).toHaveLength(2);
    gaps.forEach((gap) => expect(gap).toHaveAttribute('aria-hidden', 'true'));
  });

  it('announces the visible range in a polite live region', () => {
    render(
      <Pagination page={2} pageCount={14} pageSize={25} totalItems={340} onPageChange={vi.fn()} />,
    );

    const summary = screen.getByText('26–50 of 340');
    expect(summary).toHaveAttribute('aria-live', 'polite');
  });

  it('omits the page-size picker until a handler is supplied', async () => {
    const user = userEvent.setup();
    const onPageSizeChange = vi.fn();

    const { unmount } = render(<Pagination page={1} pageCount={4} onPageChange={vi.fn()} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    unmount();

    render(
      <Pagination
        page={1}
        pageCount={4}
        pageSize={25}
        onPageChange={vi.fn()}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox'), '50');
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it('blocks every control while disabled', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageCount={10} onPageChange={onPageChange} disabled />);

    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled());

    await user.click(screen.getByRole('button', { name: 'Go to page 3' }));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('survives out-of-range and fractional input', () => {
    render(<Pagination page={99} pageCount={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Page 5, current page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled();
  });

  it('falls back to a single page when pageCount is missing', () => {
    render(<Pagination page={1} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Page 1, current page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled();
  });
});

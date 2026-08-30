// Unit tests for the design-system DataTable component (issue #971).
// Covers: column rendering, sort interactions, empty/loading/error states,
// pagination delegation, and accessibility attributes.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import DataTable, { nextSort } from './DataTable.jsx';

const COLUMNS = [
  { key: 'wallet', header: 'Wallet' },
  { key: 'points', header: 'Points', sortable: true },
  { key: 'rank', header: 'Rank', sortable: true },
];

const ROWS = [
  { id: '1', wallet: 'GABC…', points: 120, rank: 1 },
  { id: '2', wallet: 'GXYZ…', points: 80, rank: 2 },
];

// ── nextSort helper ────────────────────────────────────────────────────────
describe('nextSort', () => {
  it('starts ascending when switching to a new column', () => {
    expect(nextSort('points', 'rank', 'asc')).toEqual({ key: 'points', dir: 'asc' });
  });

  it('flips to descending when already sorting asc by the same column', () => {
    expect(nextSort('points', 'points', 'asc')).toEqual({ key: 'points', dir: 'desc' });
  });

  it('flips back to ascending when already sorting desc by the same column', () => {
    expect(nextSort('points', 'points', 'desc')).toEqual({ key: 'points', dir: 'asc' });
  });
});

// ── Rendering ──────────────────────────────────────────────────────────────
describe('DataTable rendering', () => {
  it('renders column headers', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} />);
    expect(screen.getByRole('columnheader', { name: /wallet/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /points/i })).toBeInTheDocument();
  });

  it('renders row data', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} />);
    expect(screen.getByText('GABC…')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('renders cells via a custom render function when provided', () => {
    const cols = [{ key: 'points', header: 'Points', render: (val) => <strong>{val} pts</strong> }];
    render(<DataTable columns={cols} rows={[{ id: '1', points: 99 }]} />);
    expect(screen.getByText('99 pts')).toBeInTheDocument();
  });
});

// ── Empty / Loading / Error states ─────────────────────────────────────────
describe('DataTable states', () => {
  it('shows the empty message when rows is empty', () => {
    render(<DataTable columns={COLUMNS} rows={[]} emptyMessage="Nothing here yet." />);
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('shows the error message when isError is true', () => {
    render(<DataTable columns={COLUMNS} rows={[]} isError errorMessage="Failed to load." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load.');
  });

  it('renders skeleton rows when isLoading is true and hides real rows', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isLoading />);
    // rows should not appear
    expect(screen.queryByText('GABC…')).not.toBeInTheDocument();
    // tbody should be marked busy
    const tbody = document.querySelector('tbody');
    expect(tbody).toHaveAttribute('aria-busy', 'true');
  });
});

// ── Sort interaction ───────────────────────────────────────────────────────
describe('DataTable sorting', () => {
  it('renders sort buttons only for sortable columns', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} />);
    // "Wallet" is not sortable — no button inside that header
    const walletTh = screen.getByRole('columnheader', { name: /wallet/i });
    expect(walletTh.querySelector('button')).toBeNull();
    // "Points" is sortable
    expect(screen.getByRole('button', { name: /sort by points/i })).toBeInTheDocument();
  });

  it('sets aria-sort="ascending" on the active sorted column', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} sortKey="points" sortDir="asc" />);
    const th = screen.getByRole('columnheader', { name: /points/i });
    expect(th).toHaveAttribute('aria-sort', 'ascending');
  });

  it('sets aria-sort="descending" when sortDir is desc', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} sortKey="points" sortDir="desc" />);
    const th = screen.getByRole('columnheader', { name: /points/i });
    expect(th).toHaveAttribute('aria-sort', 'descending');
  });

  it('calls onSort with the next key and direction when a sort button is clicked', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(
      <DataTable columns={COLUMNS} rows={ROWS} sortKey="rank" sortDir="asc" onSort={onSort} />,
    );

    // click Points sort button — switching from "rank" to "points" → starts asc
    await user.click(screen.getByRole('button', { name: /sort by points/i }));
    expect(onSort).toHaveBeenCalledWith('points', 'asc');
  });

  it('flips direction when clicking the already-active sort column', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(
      <DataTable columns={COLUMNS} rows={ROWS} sortKey="points" sortDir="asc" onSort={onSort} />,
    );

    await user.click(screen.getByRole('button', { name: /sort by points/i }));
    expect(onSort).toHaveBeenCalledWith('points', 'desc');
  });
});

// ── Pagination ─────────────────────────────────────────────────────────────
describe('DataTable pagination', () => {
  it('does not render pagination when pageCount is 1', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} pageCount={1} />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('renders pagination when pageCount > 1', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} page={1} pageCount={3} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});

// ── Accessibility ──────────────────────────────────────────────────────────
describe('DataTable accessibility', () => {
  it('renders a table with role="grid"', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} />);
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('includes a visible live region for sort announcements', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} sortKey="points" sortDir="asc" />);
    const live = document.querySelector('[role="status"][aria-live="polite"]');
    expect(live).toBeInTheDocument();
    expect(live).toHaveTextContent(/ascending/i);
  });
});

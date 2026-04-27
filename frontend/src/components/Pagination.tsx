/**
 * Pagination component
 *
 * Reads/writes `page` and `pageSize` query params so the URL always
 * reflects the visible data. Back/forward navigation and sharing a URL
 * both land on the correct page.
 *
 * Usage:
 *   const { page, pageSize, PaginationControls } = usePagination();
 *
 *   // After fetching:
 *   <PaginationControls meta={data.meta} />
 *
 * API metadata shape expected from the server:
 *   { page: number; pageSize: number; total: number; totalPages: number }
 */

import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../styles/pagination.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Reads pagination state from URL search params and returns helpers
 * for updating them.  All changes push a new history entry so
 * back/forward navigation works as expected.
 */
export function usePagination(defaultPageSize: PageSize = 25) {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize = (
    PAGE_SIZE_OPTIONS.includes(Number(searchParams.get('pageSize')) as PageSize)
      ? Number(searchParams.get('pageSize'))
      : defaultPageSize
  ) as PageSize;

  const setPage = useCallback(
    (next: number) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set('page', String(next));
          return p;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const setPageSize = useCallback(
    (next: PageSize) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set('pageSize', String(next));
          p.set('page', '1'); // reset to page 1 on size change
          return p;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  return { page, pageSize, setPage, setPageSize };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PaginationProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  currentPageSize: PageSize;
  isLoading?: boolean;
}

export function PaginationControls({
  meta,
  onPageChange,
  onPageSizeChange,
  currentPageSize,
  isLoading = false,
}: PaginationProps) {
  const { page, total, totalPages } = meta;

  const start = total === 0 ? 0 : (page - 1) * currentPageSize + 1;
  const end = Math.min(page * currentPageSize, total);

  // Build visible page window: always show first, last, and ±2 around current.
  const pages = buildPageWindow(page, totalPages);

  return (
    <nav className="pagination" aria-label="Pagination" aria-busy={isLoading}>
      {/* Results summary */}
      <span className="pagination-summary" aria-live="polite">
        {total === 0 ? 'No results' : `${start}–${end} of ${total.toLocaleString()}`}
      </span>

      {/* Page size */}
      <label className="pagination-size-label">
        <span className="sr-only">Results per page</span>
        <select
          className="pagination-size-select"
          value={currentPageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
          disabled={isLoading}
          aria-label="Results per page"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} per page
            </option>
          ))}
        </select>
      </label>

      {/* Page buttons */}
      <div className="pagination-pages" role="list">
        <button
          className="pagination-btn"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || isLoading}
          aria-label="Previous page"
        >
          ‹
        </button>

        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="pagination-ellipsis" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              className={`pagination-btn ${p === page ? 'is-current' : ''}`}
              onClick={() => onPageChange(p)}
              disabled={isLoading}
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          ),
        )}

        <button
          className="pagination-btn"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || isLoading}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </nav>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type PageItem = number | '…';

function buildPageWindow(current: number, total: number): PageItem[] {
  if (total <= 7) return range(1, total);

  const window = new Set([1, total, current, current - 1, current + 1, current - 2, current + 2]);

  const sorted = [...window].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);

  const result: PageItem[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
    result.push(sorted[i]);
  }
  return result;
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

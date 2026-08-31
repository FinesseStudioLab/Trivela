/**
 * Pagination — shared design-system component.
 *
 * A presentational control: it owns no routing and no data fetching, so the
 * same component backs URL-driven lists, modal tables and embeds alike.
 * (`src/components/Pagination.tsx` remains the router-bound wrapper used by
 * the campaign list.)
 *
 * Accessibility:
 *   - rendered as <nav aria-label> wrapping an ordered list, so screen readers
 *     announce "list, N items" and expose the page order
 *   - the active page carries aria-current="page"
 *   - every control has an explicit aria-label ("Go to page 4"), because the
 *     visible label is just a number
 *   - a polite live region announces the range after each change
 *   - truncation gaps are inert <li aria-hidden> — never focusable
 *
 * Usage:
 *   <Pagination page={page} pageCount={totalPages} onPageChange={setPage} />
 */

import { useMemo } from 'react';
import './tokens.css';
import './Pagination.css';

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** Marker pushed into the page list where pages were collapsed. */
export const ELLIPSIS = 'ellipsis';

function range(start, end) {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);
}

/**
 * Build the visible page list: boundary pages at each end, a window of
 * `siblingCount` pages either side of the current page, and `ELLIPSIS`
 * markers wherever pages were collapsed.
 *
 * Pure and exported so the windowing rules can be unit-tested without
 * rendering anything.
 */
export function getPageItems({ page, pageCount, siblingCount = 1, boundaryCount = 1 }) {
  if (!Number.isFinite(pageCount) || pageCount < 1) return [];

  const current = Math.min(Math.max(1, page), pageCount);

  // Boundaries + siblings + current + the two ellipsis slots. Below this many
  // pages, showing everything is both simpler and shorter than truncating.
  const totalSlots = boundaryCount * 2 + siblingCount * 2 + 3;
  if (pageCount <= totalSlots) return range(1, pageCount);

  const startPages = range(1, boundaryCount);
  const endPages = range(pageCount - boundaryCount + 1, pageCount);

  // Clamp the sibling window so it never overlaps the boundary blocks.
  const siblingStart = Math.max(
    Math.min(current - siblingCount, pageCount - boundaryCount - siblingCount * 2 - 1),
    boundaryCount + 2,
  );
  const siblingEnd = Math.min(
    Math.max(current + siblingCount, boundaryCount + siblingCount * 2 + 2),
    pageCount - boundaryCount - 1,
  );

  return [
    ...startPages,
    siblingStart > boundaryCount + 2 ? ELLIPSIS : boundaryCount + 1,
    ...range(siblingStart, siblingEnd),
    siblingEnd < pageCount - boundaryCount - 1 ? ELLIPSIS : pageCount - boundaryCount,
    ...endPages,
  ];
}

/** Human-readable "1–25 of 340" summary, or a plain page count when no total. */
export function formatRange({ page, pageSize, totalItems }) {
  if (!Number.isFinite(totalItems) || !Number.isFinite(pageSize) || pageSize <= 0) return '';
  if (totalItems === 0) return 'No results';

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  return `${start.toLocaleString()}–${end.toLocaleString()} of ${totalItems.toLocaleString()}`;
}

export default function Pagination({
  page,
  pageCount,
  onPageChange,
  siblingCount = 1,
  boundaryCount = 1,
  showFirstLast = false,
  disabled = false,
  size = 'md',
  totalItems,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onPageSizeChange,
  label = 'Pagination',
  className = '',
  ...rest
}) {
  const safePageCount = Math.max(1, Math.floor(pageCount) || 1);
  const current = Math.min(Math.max(1, Math.floor(page) || 1), safePageCount);

  const items = useMemo(
    () => getPageItems({ page: current, pageCount: safePageCount, siblingCount, boundaryCount }),
    [current, safePageCount, siblingCount, boundaryCount],
  );

  const summary = formatRange({ page: current, pageSize, totalItems });
  const isFirst = current <= 1;
  const isLast = current >= safePageCount;

  const goTo = (next) => {
    const clamped = Math.min(Math.max(1, next), safePageCount);
    if (clamped === current || disabled) return;
    onPageChange?.(clamped);
  };

  return (
    <nav
      className={['ds-pagination', className].filter(Boolean).join(' ')}
      data-size={size}
      aria-label={label}
      {...rest}
    >
      {summary ? (
        <p className="ds-pagination__summary" aria-live="polite">
          {summary}
        </p>
      ) : null}

      <ol className="ds-pagination__list">
        {showFirstLast ? (
          <li>
            <button
              type="button"
              className="ds-pagination__button ds-pagination__button--edge"
              onClick={() => goTo(1)}
              disabled={disabled || isFirst}
              aria-label="Go to first page"
            >
              <span aria-hidden="true">«</span>
            </button>
          </li>
        ) : null}

        <li>
          <button
            type="button"
            className="ds-pagination__button ds-pagination__button--edge"
            onClick={() => goTo(current - 1)}
            disabled={disabled || isFirst}
            aria-label="Go to previous page"
          >
            <span aria-hidden="true">‹</span>
          </button>
        </li>

        {items.map((item, index) =>
          item === ELLIPSIS ? (
            // Gaps have no stable identity; their position in the list is the key.
            <li key={`gap-${index}`} className="ds-pagination__gap" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                className={`ds-pagination__button${item === current ? ' is-current' : ''}`}
                onClick={() => goTo(item)}
                disabled={disabled}
                aria-label={item === current ? `Page ${item}, current page` : `Go to page ${item}`}
                aria-current={item === current ? 'page' : undefined}
              >
                {item}
              </button>
            </li>
          ),
        )}

        <li>
          <button
            type="button"
            className="ds-pagination__button ds-pagination__button--edge"
            onClick={() => goTo(current + 1)}
            disabled={disabled || isLast}
            aria-label="Go to next page"
          >
            <span aria-hidden="true">›</span>
          </button>
        </li>

        {showFirstLast ? (
          <li>
            <button
              type="button"
              className="ds-pagination__button ds-pagination__button--edge"
              onClick={() => goTo(safePageCount)}
              disabled={disabled || isLast}
              aria-label="Go to last page"
            >
              <span aria-hidden="true">»</span>
            </button>
          </li>
        ) : null}
      </ol>

      {onPageSizeChange ? (
        <label className="ds-pagination__size">
          <span className="ds-pagination__size-label">Per page</span>
          <select
            className="ds-pagination__select"
            value={pageSize}
            disabled={disabled}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </nav>
  );
}

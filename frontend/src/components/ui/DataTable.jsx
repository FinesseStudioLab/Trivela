/**
 * DataTable — shared design-system component.
 *
 * A presentational, accessible data table with sortable columns,
 * pagination, and empty / loading / error states. It owns no data fetching
 * and no routing, so it works in campaign lists, leaderboards, admin views,
 * and Storybook alike.
 *
 * Accessibility:
 *   - <table> with role="grid" so screen readers announce it as a grid
 *   - <th scope="col"> with aria-sort on sortable columns
 *   - Sort buttons are real <button> elements — fully keyboard reachable
 *   - A live region announces the active sort after each change
 *   - Loading rows use aria-busy on the <tbody>
 *   - Empty/error states use a <td colSpan> row so the table structure is valid
 *
 * Usage:
 *   <DataTable
 *     columns={[
 *       { key: 'wallet', header: 'Wallet' },
 *       { key: 'points', header: 'Points', sortable: true },
 *     ]}
 *     rows={[{ wallet: 'GAB…', points: 120 }]}
 *     page={1}
 *     pageCount={4}
 *     onPageChange={setPage}
 *     sortKey="points"
 *     sortDir="desc"
 *     onSort={(key, dir) => { ... }}
 *   />
 */

import { useId } from 'react';
import { Pagination } from './index.js';
import './tokens.css';
import './DataTable.css';

const SKELETON_ROWS = 5;

/** Chevron icon pair — up/down arrows to indicate sort direction. */
function SortIcon({ columnKey, sortKey, sortDir }) {
  const isActive = columnKey === sortKey;
  const isAsc = isActive && sortDir === 'asc';
  const isDesc = isActive && sortDir === 'desc';

  return (
    <span className="ds-table__sort-icon" aria-hidden="true">
      <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor" opacity={isAsc ? 1 : 0.35}>
        <path d="M4 0 L8 5 L0 5 Z" />
      </svg>
      <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor" opacity={isDesc ? 1 : 0.35}>
        <path d="M4 5 L0 0 L8 0 Z" />
      </svg>
    </span>
  );
}

/**
 * Toggle sort direction: if already sorted by this key, flip asc↔desc.
 * If this is a new key, always start with 'asc'.
 */
function nextSort(columnKey, currentKey, currentDir) {
  if (columnKey !== currentKey) return { key: columnKey, dir: 'asc' };
  return { key: columnKey, dir: currentDir === 'asc' ? 'desc' : 'asc' };
}

export { nextSort };

export default function DataTable({
  columns = [],
  rows = [],
  isLoading = false,
  isError = false,
  emptyMessage = 'No data to display.',
  errorMessage = 'Something went wrong loading this data.',
  page = 1,
  pageCount = 1,
  onPageChange,
  sortKey,
  sortDir = 'asc',
  onSort,
  caption,
  className = '',
  ...rest
}) {
  const liveId = useId();
  const colCount = columns.length;

  function handleSort(col) {
    if (!col.sortable || !onSort) return;
    const next = nextSort(col.key, sortKey, sortDir);
    onSort(next.key, next.dir);
  }

  // What to announce in the live region after a sort change
  const sortAnnouncement = sortKey
    ? `Table sorted by ${columns.find((c) => c.key === sortKey)?.header ?? sortKey}, ${sortDir === 'asc' ? 'ascending' : 'descending'}.`
    : '';

  return (
    <div className={`ds-table-wrap ${className}`.trim()} {...rest}>
      {/* live region announces sort changes to screen readers */}
      <span id={liveId} className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {sortAnnouncement}
      </span>

      <div className="ds-table-scroll">
        <table className="ds-table" role="grid">
          {caption && <caption className="sr-only">{caption}</caption>}

          <thead className="ds-table__thead">
            <tr>
              {columns.map((col) => {
                const isSorted = col.key === sortKey;
                const ariaSortValue = isSorted
                  ? sortDir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : undefined;

                return (
                  <th key={col.key} scope="col" className="ds-table__th" aria-sort={ariaSortValue}>
                    {col.sortable ? (
                      <button
                        type="button"
                        className="ds-table__sort-btn"
                        onClick={() => handleSort(col)}
                        aria-label={`Sort by ${col.header}${isSorted ? `, currently ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                      >
                        {col.header}
                        <SortIcon columnKey={col.key} sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="ds-table__tbody" aria-busy={isLoading ? 'true' : undefined}>
            {isLoading &&
              Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <tr key={`skeleton-${i}`} className="ds-table__state-row">
                  {columns.map((col) => (
                    <td key={col.key} className="ds-table__td">
                      <span className="ds-table__skeleton" aria-hidden="true" />
                    </td>
                  ))}
                </tr>
              ))}

            {!isLoading && isError && (
              <tr className="ds-table__state-row">
                <td colSpan={colCount} role="alert">
                  {errorMessage}
                </td>
              </tr>
            )}

            {!isLoading && !isError && rows.length === 0 && (
              <tr className="ds-table__state-row">
                <td colSpan={colCount}>{emptyMessage}</td>
              </tr>
            )}

            {!isLoading &&
              !isError &&
              rows.map((row, rowIndex) => (
                <tr key={row.id ?? rowIndex}>
                  {columns.map((col) => (
                    <td key={col.key} className="ds-table__td">
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && !isLoading && !isError && (
        <Pagination page={page} pageCount={pageCount} onPageChange={onPageChange} />
      )}
    </div>
  );
}

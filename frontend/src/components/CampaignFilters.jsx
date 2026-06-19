import { useEffect, useRef, useState } from 'react';

/**
 * Search / filter / sort controls for the campaign list on Landing.
 *
 * Stateful pieces:
 *  - the search input is uncontrolled-ish: it owns its own draft string and
 *    debounces 300ms before pushing the trimmed value up via `onQueryChange`.
 *    This keeps every keystroke from triggering a network request while
 *    still feeling responsive.
 *  - active toggle and sort dropdown are fully controlled — the parent
 *    keeps the canonical state and pushes it into the URL.
 *
 * Sort options map to the backend's `?sort=&order=` contract on
 * `GET /api/v1/campaigns` (see backend/src/index.js:463-466).
 */
export default function CampaignFilters({
  query,
  activeOnly,
  sortKey,
  onQueryChange,
  onActiveOnlyChange,
  onSortKeyChange,
  debounceMs = 300,
}) {
  const [draft, setDraft] = useState(query ?? '');
  const queryRef = useRef(query ?? '');
  const timerRef = useRef(null);

  // Keep the input in sync with parent-driven changes (e.g. on first load
  // when the URL contains ?q=foo, or when filters are reset elsewhere).
  useEffect(() => {
    if ((query ?? '') !== queryRef.current) {
      queryRef.current = query ?? '';
      setDraft(query ?? '');
    }
  }, [query]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function handleQueryInput(event) {
    const next = event.target.value;
    setDraft(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const trimmed = next.trim();
      queryRef.current = trimmed;
      onQueryChange?.(trimmed);
    }, debounceMs);
  }

  return (
    <div className="campaign-filters" role="search" aria-label="Filter campaigns">
      <div className="campaign-search">
        <label htmlFor="campaign-search-input" className="campaign-search-label">
          Search campaigns
        </label>
        <input
          id="campaign-search-input"
          type="search"
          value={draft}
          onChange={handleQueryInput}
          className="campaign-search-input"
          placeholder="Search by campaign name or description"
          autoComplete="off"
        />
      </div>

      <div className="campaign-filter-row">
        <label className="campaign-filter-toggle">
          <input
            type="checkbox"
            checked={Boolean(activeOnly)}
            onChange={(event) => onActiveOnlyChange?.(event.target.checked)}
          />
          <span>Active only</span>
        </label>

        <label className="campaign-sort">
          <span className="campaign-sort-label">Sort by</span>
          <select
            className="campaign-sort-select"
            value={sortKey ?? 'newest'}
            onChange={(event) => onSortKeyChange?.(event.target.value)}
            aria-label="Sort campaigns"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name_asc">Name A–Z</option>
            <option value="name_desc">Name Z–A</option>
            <option value="reward_desc">Reward (high to low)</option>
          </select>
        </label>
      </div>
    </div>
  );
}

/**
 * Map the UI sort key to the backend's `(sort, order)` tuple. Kept next
 * to the component so the two stay in lock-step.
 *
 * @param {string} key
 * @returns {{ sort?: string, order?: 'asc' | 'desc' }}
 */
export function sortKeyToApiParams(key) {
  switch (key) {
    case 'oldest':
      return { sort: 'created_at', order: 'asc' };
    case 'name_asc':
      return { sort: 'name', order: 'asc' };
    case 'name_desc':
      return { sort: 'name', order: 'desc' };
    case 'reward_desc':
      return { sort: 'reward_per_action', order: 'desc' };
    case 'newest':
    default:
      return { sort: 'created_at', order: 'desc' };
  }
}

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
export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'reward_desc', label: 'Reward (high to low)' },
  { value: 'urgency', label: 'Urgency' },
];

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

  // Accessible dropdown state
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const listboxRef = useRef(null);

  const currentSort = sortKey ?? 'newest';
  const selectedOption = SORT_OPTIONS.find((opt) => opt.value === currentSort) || SORT_OPTIONS[0];

  // Keep the input in sync with parent-driven changes
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

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

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

  function selectOption(option) {
    onSortKeyChange?.(option.value);
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function handleTriggerKeyDown(event) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          const currentIndex = SORT_OPTIONS.findIndex((o) => o.value === currentSort);
          setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
        } else {
          setHighlightedIndex((prev) => (prev < SORT_OPTIONS.length - 1 ? prev + 1 : 0));
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          const currentIndex = SORT_OPTIONS.findIndex((o) => o.value === currentSort);
          setHighlightedIndex(currentIndex >= 0 ? currentIndex : SORT_OPTIONS.length - 1);
        } else {
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : SORT_OPTIONS.length - 1));
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (isOpen && highlightedIndex >= 0 && highlightedIndex < SORT_OPTIONS.length) {
          selectOption(SORT_OPTIONS[highlightedIndex]);
        } else {
          setIsOpen((prev) => !prev);
          const currentIndex = SORT_OPTIONS.findIndex((o) => o.value === currentSort);
          setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
        }
        break;
      case 'Escape':
        if (isOpen) {
          event.preventDefault();
          setIsOpen(false);
          triggerRef.current?.focus();
        }
        break;
      case 'Home':
        if (isOpen) {
          event.preventDefault();
          setHighlightedIndex(0);
        }
        break;
      case 'End':
        if (isOpen) {
          event.preventDefault();
          setHighlightedIndex(SORT_OPTIONS.length - 1);
        }
        break;
      case 'Tab':
        if (isOpen) {
          setIsOpen(false);
        }
        break;
      default:
        break;
    }
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

        <div className="campaign-sort" ref={dropdownRef} style={{ position: 'relative' }}>
          <span id="campaign-sort-label" className="campaign-sort-label">
            Sort by
          </span>

          {/* Accessible Custom Combobox Trigger */}
          <button
            ref={triggerRef}
            type="button"
            id="campaign-sort-trigger"
            className="campaign-sort-select campaign-sort-trigger"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-controls="campaign-sort-listbox"
            aria-labelledby="campaign-sort-label campaign-sort-trigger"
            aria-activedescendant={
              isOpen && highlightedIndex >= 0
                ? `sort-option-${SORT_OPTIONS[highlightedIndex].value}`
                : undefined
            }
            onClick={() => {
              setIsOpen((prev) => !prev);
              const currentIndex = SORT_OPTIONS.findIndex((o) => o.value === currentSort);
              setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
            }}
            onKeyDown={handleTriggerKeyDown}
          >
            <span>{selectedOption.label}</span>
            <span className="dropdown-chevron" aria-hidden="true" style={{ marginLeft: '6px' }}>
              ▾
            </span>
          </button>

          {/* Accessible Listbox Popup */}
          {isOpen && (
            <ul
              ref={listboxRef}
              id="campaign-sort-listbox"
              className="campaign-sort-menu"
              role="listbox"
              aria-labelledby="campaign-sort-label"
              tabIndex={-1}
              onKeyDown={handleTriggerKeyDown}
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                zIndex: 50,
                background: 'var(--bg-card-solid, #1e293b)',
                border: '1px solid var(--border, #334155)',
                borderRadius: '8px',
                padding: '4px',
                listStyle: 'none',
                minWidth: '180px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}
            >
              {SORT_OPTIONS.map((option, index) => {
                const isSelected = option.value === currentSort;
                const isHighlighted = index === highlightedIndex;
                return (
                  <li
                    key={option.value}
                    id={`sort-option-${option.value}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => selectOption(option)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      background: isHighlighted
                        ? 'var(--accent-hover, #334155)'
                        : isSelected
                        ? 'rgba(255,255,255,0.06)'
                        : 'transparent',
                      color: 'var(--text, #f8fafc)',
                      fontWeight: isSelected ? '600' : 'normal',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>{option.label}</span>
                    {isSelected && <span aria-hidden="true">✓</span>}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Native select kept visually hidden for screen reader/test fallback */}
          <select
            className="campaign-sort-native-select"
            value={currentSort}
            onChange={(event) => onSortKeyChange?.(event.target.value)}
            aria-label="Sort campaigns"
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
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
    case 'urgency':
      return { sort: 'urgency', order: 'desc' };
    case 'newest':
    default:
      return { sort: 'created_at', order: 'desc' };
  }
}

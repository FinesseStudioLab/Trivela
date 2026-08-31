/**
 * Tabs — shared design-system component.
 *
 * Implements the WAI-ARIA Tabs pattern:
 *   - tablist / tab / tabpanel roles and the aria-controls ↔ aria-labelledby pair
 *   - roving tabindex, so the tab strip is a single tab stop
 *   - Arrow keys move between tabs (wrapping), Home/End jump to the ends
 *   - disabled tabs are skipped by keyboard navigation and are not clickable
 *   - `activation="manual"` moves focus without selecting until Enter/Space
 *
 * Works controlled (`value` + `onChange`) or uncontrolled (`defaultValue`).
 *
 * Usage:
 *   <Tabs
 *     items={[
 *       { id: 'overview', label: 'Overview', content: <Overview /> },
 *       { id: 'rewards', label: 'Rewards', content: <Rewards />, badge: 3 },
 *     ]}
 *     defaultValue="overview"
 *   />
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import './tokens.css';
import './Tabs.css';

const HORIZONTAL_KEYS = { prev: 'ArrowLeft', next: 'ArrowRight' };
const VERTICAL_KEYS = { prev: 'ArrowUp', next: 'ArrowDown' };

/**
 * Index of the next enabled tab, searching in `step` direction and wrapping
 * around the ends. Returns `from` when every other tab is disabled.
 */
export function nextEnabledIndex(items, from, step) {
  const count = items.length;
  if (count === 0) return -1;

  for (let hop = 1; hop <= count; hop += 1) {
    const candidate = (from + step * hop + count * count) % count;
    if (!items[candidate].disabled) return candidate;
  }
  return from;
}

/** First enabled tab, or 0 when they are all disabled. */
function firstEnabledIndex(items) {
  const found = items.findIndex((item) => !item.disabled);
  return found === -1 ? 0 : found;
}

export default function Tabs({
  items = [],
  value,
  defaultValue,
  onChange,
  orientation = 'horizontal',
  activation = 'automatic',
  variant = 'underline',
  size = 'md',
  className = '',
  label = 'Tabs',
  ...rest
}) {
  const baseId = useId();
  const tabRefs = useRef([]);

  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(
    () => defaultValue ?? items[firstEnabledIndex(items)]?.id,
  );

  const selectedId = isControlled ? value : internalValue;
  const selectedIndex = useMemo(() => {
    const found = items.findIndex((item) => item.id === selectedId);
    return found === -1 ? firstEnabledIndex(items) : found;
  }, [items, selectedId]);

  // `focusIndex` drives the roving tabindex. It tracks selection, except while
  // the user is arrowing around a manual-activation tab strip.
  const [focusIndex, setFocusIndex] = useState(selectedIndex);
  useEffect(() => {
    setFocusIndex(selectedIndex);
  }, [selectedIndex]);

  const select = useCallback(
    (index) => {
      const item = items[index];
      if (!item || item.disabled) return;
      if (!isControlled) setInternalValue(item.id);
      onChange?.(item.id, index);
    },
    [items, isControlled, onChange],
  );

  const moveFocus = useCallback(
    (index) => {
      setFocusIndex(index);
      tabRefs.current[index]?.focus();
      if (activation === 'automatic') select(index);
    },
    [activation, select],
  );

  const handleKeyDown = useCallback(
    (event) => {
      const keys = orientation === 'vertical' ? VERTICAL_KEYS : HORIZONTAL_KEYS;

      switch (event.key) {
        case keys.prev:
          event.preventDefault();
          moveFocus(nextEnabledIndex(items, focusIndex, -1));
          break;
        case keys.next:
          event.preventDefault();
          moveFocus(nextEnabledIndex(items, focusIndex, 1));
          break;
        case 'Home':
          event.preventDefault();
          moveFocus(nextEnabledIndex(items, items.length - 1, 1));
          break;
        case 'End':
          event.preventDefault();
          moveFocus(nextEnabledIndex(items, 0, -1));
          break;
        case 'Enter':
        case ' ':
          // Automatic activation already selected on focus.
          if (activation === 'manual') {
            event.preventDefault();
            select(focusIndex);
          }
          break;
        default:
          break;
      }
    },
    [activation, focusIndex, items, moveFocus, orientation, select],
  );

  if (items.length === 0) return null;

  const tabId = (index) => `${baseId}-tab-${items[index].id}`;
  const panelId = (index) => `${baseId}-panel-${items[index].id}`;
  const activeItem = items[selectedIndex];

  return (
    <div
      className={['ds-tabs', `ds-tabs--${orientation}`, `ds-tabs--${variant}`, className]
        .filter(Boolean)
        .join(' ')}
      data-size={size}
      {...rest}
    >
      <div
        role="tablist"
        aria-label={label}
        aria-orientation={orientation}
        className="ds-tabs__list"
        onKeyDown={handleKeyDown}
      >
        {items.map((item, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={tabId(index)}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              className={`ds-tabs__tab${isSelected ? ' is-selected' : ''}`}
              aria-selected={isSelected}
              aria-controls={panelId(index)}
              aria-disabled={item.disabled ? true : undefined}
              disabled={item.disabled}
              tabIndex={index === focusIndex ? 0 : -1}
              onClick={() => {
                setFocusIndex(index);
                select(index);
              }}
            >
              {item.icon ? (
                <span className="ds-tabs__icon" aria-hidden="true">
                  {item.icon}
                </span>
              ) : null}
              <span className="ds-tabs__label">{item.label}</span>
              {item.badge !== undefined && item.badge !== null ? (
                <span className="ds-tabs__badge">{item.badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {activeItem ? (
        <div
          role="tabpanel"
          id={panelId(selectedIndex)}
          aria-labelledby={tabId(selectedIndex)}
          className="ds-tabs__panel"
          tabIndex={0}
        >
          {activeItem.content}
        </div>
      ) : null}
    </div>
  );
}

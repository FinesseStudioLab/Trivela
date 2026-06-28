import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

/**
 * Windowed list (issue #629). Only the rows in or near the viewport are kept in
 * the DOM, so large datasets (thousands of rows) scroll smoothly without
 * bloating the DOM. Rows are measured dynamically, which handles variable row
 * heights.
 *
 * When the user scrolls within `endThreshold` rows of the end, `onReachEnd`
 * fires so the caller can load the next page — infinite scroll over the
 * existing cursor pagination. Callers should guard `onReachEnd` (e.g. with
 * `hasMore && !isLoadingMore`) since it may fire more than once.
 *
 * The scroll container and each row are role-agnostic: pass ARIA via
 * `containerProps` and `getItemProps` so the caller keeps its table semantics
 * (e.g. `role="rowgroup"` here, `role="row"` + `aria-rowindex` per item).
 *
 * @param {object} props
 * @param {Array} props.items
 * @param {(item: any, index: number) => string|number} props.getKey
 * @param {(item: any, index: number) => React.ReactNode} props.renderItem
 * @param {(item: any, index: number) => object} [props.getItemProps]
 * @param {number} [props.estimateSize] estimated row height in px
 * @param {number} [props.overscan]
 * @param {number} [props.endThreshold] rows from the end that trigger onReachEnd
 * @param {() => void} [props.onReachEnd]
 * @param {string} [props.className]
 * @param {object} [props.style]
 * @param {object} [props.containerProps] spread onto the scroll container (ARIA, etc.)
 */
export default function VirtualizedList({
  items,
  getKey,
  renderItem,
  getItemProps,
  estimateSize = 56,
  overscan = 10,
  endThreshold = 8,
  onReachEnd,
  className,
  style,
  containerProps = {},
}) {
  const scrollRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems.length ? virtualItems[virtualItems.length - 1].index : -1;

  // Infinite scroll: fire when the last rendered row nears the end of the data.
  useEffect(() => {
    if (!onReachEnd) return;
    if (items.length > 0 && lastIndex >= items.length - 1 - endThreshold) {
      onReachEnd();
    }
  }, [lastIndex, items.length, endThreshold, onReachEnd]);

  return (
    <div
      ref={scrollRef}
      className={className}
      style={{ overflowY: 'auto', ...style }}
      {...containerProps}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          const itemProps = getItemProps ? getItemProps(item, virtualItem.index) : {};
          return (
            <div
              key={getKey(item, virtualItem.index)}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              {...itemProps}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
                ...(itemProps.style || {}),
              }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

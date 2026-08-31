/**
 * Tooltip and Popover — shared design-system overlays.
 *
 * Both wrap a single trigger element and render a floating bubble positioned
 * with CSS (no positioning library, no runtime measurement), so they stay cheap
 * and behave identically under test.
 *
 * Tooltip — a passive description used for inline glossary terms (TTL, vesting):
 *   - role="tooltip", wired to the trigger with aria-describedby
 *   - opens on hover *and* on keyboard focus (WCAG 2.1.1)
 *   - stays open while the pointer is over the bubble itself, so users can read
 *     long copy without it vanishing (WCAG 1.4.13 "hoverable")
 *   - Escape dismisses it while the trigger keeps focus (WCAG 1.4.13
 *     "dismissable")
 *   - open/close delays are cancelled on unmount — no setState after teardown
 *
 * Popover — an interactive panel:
 *   - role="dialog" with aria-labelledby when a title is supplied
 *   - trigger carries aria-expanded / aria-haspopup="dialog"
 *   - opens on click, closes on Escape or on an outside pointer press
 *   - focus moves into the panel on open and returns to the trigger on close
 *
 * Usage:
 *   <Tooltip content="Time-to-live for the campaign ledger entry">
 *     <button type="button">TTL</button>
 *   </Tooltip>
 *
 *   <Popover title="Vesting" content={<VestingExplainer />}>
 *     <button type="button">What is vesting?</button>
 *   </Popover>
 */

import { cloneElement, useCallback, useEffect, useId, useRef, useState } from 'react';
import './tokens.css';
import './Tooltip.css';

export const PLACEMENTS = ['top', 'bottom', 'left', 'right'];

/**
 * Timer bookkeeping shared by both overlays: schedules a state change and
 * guarantees the pending timeout is cleared on unmount.
 */
function useDelayedToggle(setOpen) {
  const timer = useRef(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const schedule = useCallback(
    (next, delay) => {
      clear();
      if (!delay) {
        setOpen(next);
        return;
      }
      timer.current = setTimeout(() => {
        timer.current = null;
        setOpen(next);
      }, delay);
    },
    [clear, setOpen],
  );

  useEffect(() => clear, [clear]);

  return { schedule, clear };
}

/** Merge our handler with any the caller already put on the trigger element. */
function chain(theirs, ours) {
  return (event) => {
    theirs?.(event);
    ours(event);
  };
}

export function Tooltip({
  children,
  content,
  placement = 'top',
  openDelay = 120,
  closeDelay = 80,
  disabled = false,
  defaultOpen = false,
  className = '',
  id: idProp,
}) {
  const generatedId = useId();
  const tooltipId = idProp ?? `${generatedId}-tooltip`;
  const [open, setOpen] = useState(defaultOpen);
  const { schedule, clear } = useDelayedToggle(setOpen);

  const show = () => !disabled && schedule(true, openDelay);
  const hide = () => schedule(false, closeDelay);

  // Escape must dismiss without moving focus, so it is bound while open.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        clear();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, clear]);

  if (!content || disabled) return children;

  const trigger = cloneElement(children, {
    'aria-describedby': open
      ? [children.props['aria-describedby'], tooltipId].filter(Boolean).join(' ')
      : children.props['aria-describedby'],
    onMouseEnter: chain(children.props.onMouseEnter, show),
    onMouseLeave: chain(children.props.onMouseLeave, hide),
    onFocus: chain(children.props.onFocus, () => !disabled && setOpen(true)),
    onBlur: chain(children.props.onBlur, () => {
      clear();
      setOpen(false);
    }),
  });

  return (
    <span
      className={['ds-overlay-root', className].filter(Boolean).join(' ')}
      // Keeping the bubble hoverable means the pointer can travel from the
      // trigger into the tooltip without tripping the close timer.
      onMouseEnter={clear}
      onMouseLeave={hide}
    >
      {trigger}
      <span
        role="tooltip"
        id={tooltipId}
        className={`ds-tooltip ds-overlay--${placement}`}
        data-state={open ? 'open' : 'closed'}
        hidden={!open}
      >
        {content}
        <span className="ds-overlay__arrow" aria-hidden="true" />
      </span>
    </span>
  );
}

export function Popover({
  children,
  content,
  title,
  placement = 'bottom',
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  closeOnOutsideClick = true,
  className = '',
  id: idProp,
}) {
  const generatedId = useId();
  const panelId = idProp ?? `${generatedId}-popover`;
  const titleId = `${panelId}-title`;

  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = isControlled ? openProp : internalOpen;

  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const wasOpen = useRef(open);

  const setOpen = useCallback(
    (next) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  // Escape closes and hands focus back; an outside press just closes.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus?.();
    };

    const onPointerDown = (event) => {
      if (!closeOnOutsideClick) return;
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, closeOnOutsideClick, setOpen]);

  // Move focus into the panel on open; return it to the trigger on close.
  useEffect(() => {
    if (open && !wasOpen.current) {
      panelRef.current?.focus?.();
    } else if (!open && wasOpen.current) {
      triggerRef.current?.focus?.();
    }
    wasOpen.current = open;
  }, [open]);

  const trigger = cloneElement(children, {
    ref: triggerRef,
    'aria-expanded': open,
    'aria-haspopup': 'dialog',
    'aria-controls': open ? panelId : undefined,
    onClick: chain(children.props.onClick, () => setOpen(!open)),
  });

  return (
    <span ref={rootRef} className={['ds-overlay-root', className].filter(Boolean).join(' ')}>
      {trigger}
      <div
        ref={panelRef}
        role="dialog"
        id={panelId}
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'More information'}
        className={`ds-popover ds-overlay--${placement}`}
        data-state={open ? 'open' : 'closed'}
        hidden={!open}
        tabIndex={-1}
      >
        {title ? (
          <h2 id={titleId} className="ds-popover__title">
            {title}
          </h2>
        ) : null}
        <div className="ds-popover__body">{content}</div>
        <span className="ds-overlay__arrow" aria-hidden="true" />
      </div>
    </span>
  );
}

export default Tooltip;

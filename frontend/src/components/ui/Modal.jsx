/**
 * Modal / Dialog — shared design-system component.
 *
 * Implements the WAI-ARIA Dialog (Modal) pattern:
 *   - role="dialog" with aria-modal="true"
 *   - aria-labelledby pointing to the title
 *   - Focus trap: Tab/Shift+Tab cycle within the modal
 *   - Escape closes the modal
 *   - Click on overlay closes the modal
 *   - Focus moves to the modal on open, returns to trigger on close
 *   - Async confirm state with loading indicator
 *
 * Usage:
 *   <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Confirm Action">
 *     <p>Are you sure?</p>
 *     <Modal.Actions>
 *       <Button onClick={() => setIsOpen(false)}>Cancel</Button>
 *       <Button variant="danger" onClick={handleConfirm}>Confirm</Button>
 *     </Modal.Actions>
 *   </Modal>
 *
 *   // Async confirm with loading state
 *   <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Delete Campaign">
 *     <p>This action cannot be undone.</p>
 *     <Modal.Actions>
 *       <Button onClick={() => setIsOpen(false)} disabled={isDeleting}>Cancel</Button>
 *       <Button variant="danger" loading={isDeleting} onClick={handleDelete}>Delete</Button>
 *     </Modal.Actions>
 *   </Modal>
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import './tokens.css';
import './Modal.css';

/**
 * Focus trap hook — keeps Tab/Shift+Tab within a container.
 * Returns a ref to attach to the container.
 */
function useFocusTrap(isActive) {
  const containerRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!isActive) return undefined;

    // Store the previously focused element
    previousFocusRef.current = document.activeElement;

    // Move focus into the modal
    const container = containerRef.current;
    if (container) {
      // Focus the first focusable element, or the container itself
      const focusable = getFocusableElements(container);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        container.focus();
      }
    }

    const handleKeyDown = (event) => {
      if (event.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey) {
        // Shift+Tab: if on first, move to last
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if on last, move to first
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus on unmount
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [isActive]);

  return containerRef;
}

/**
 * Get all focusable elements within a container.
 */
function getFocusableElements(container) {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll(selector)).filter(
    (el) => el.offsetParent !== null && !el.getAttribute('aria-hidden'),
  );
}

/**
 * Modal component — accessible, themeable modal dialog.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  className = '',
  'aria-describedby': ariaDescribedBy,
  ...rest
}) {
  const titleId = useId();
  const contentId = useId();
  const modalRef = useFocusTrap(isOpen);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return undefined;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  const handleOverlayClick = useCallback(
    (event) => {
      if (closeOnOverlayClick && event.target === event.currentTarget) {
        onClose();
      }
    },
    [closeOnOverlayClick, onClose],
  );

  if (!isOpen) return null;

  return (
    <div
      className="ds-modal-overlay"
      onClick={handleOverlayClick}
      role="presentation"
      data-state={isOpen ? 'open' : 'closed'}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={ariaDescribedBy || contentId}
        className={`ds-modal ds-modal--${size} ${className}`.trim()}
        tabIndex={-1}
        {...rest}
      >
        <div className="ds-modal__header">
          <h2 id={titleId} className="ds-modal__title">
            {title}
          </h2>
          {showCloseButton && (
            <button
              type="button"
              className="ds-modal__close"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div id={contentId} className="ds-modal__content">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Modal.Actions — container for modal action buttons.
 * Provides consistent spacing and alignment for Confirm/Cancel buttons.
 */
function ModalActions({ children, align = 'right', className = '' }) {
  return (
    <div className={`ds-modal__actions ds-modal__actions--${align} ${className}`.trim()}>
      {children}
    </div>
  );
}

Modal.Actions = ModalActions;

/**
 * ConfirmDialog — simplified modal for confirmations with async support.
 *
 * Usage:
 *   <ConfirmDialog
 *     isOpen={isOpen}
 *     onClose={() => setIsOpen(false)}
 *     onConfirm={handleConfirm}
 *     title="Delete Campaign?"
 *     message="This action cannot be undone."
 *     confirmLabel="Delete"
 *     variant="danger"
 *     loading={isDeleting}
 *   />
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  loading = false,
  disabled = false,
}) {
  const handleConfirm = async () => {
    try {
      await onConfirm();
      onClose();
    } catch {
      // Error handling is left to the parent component
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={loading ? undefined : onClose} title={title} size="sm">
      <p className="ds-modal__message">{message}</p>
      <Modal.Actions>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onClose}
          disabled={loading}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`btn btn-${variant}`}
          onClick={handleConfirm}
          disabled={disabled || loading}
          aria-busy={loading}
        >
          {loading ? (
            <span className="ds-modal__loading">
              <span className="ds-modal__spinner" aria-hidden="true" />
              {confirmLabel}
            </span>
          ) : (
            confirmLabel
          )}
        </button>
      </Modal.Actions>
    </Modal>
  );
}

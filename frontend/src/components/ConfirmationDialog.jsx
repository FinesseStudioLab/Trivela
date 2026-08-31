import { useEffect, useRef } from 'react';
import './ConfirmationDialog.css';

export default function ConfirmationDialog({ isOpen, title, message, onConfirm, onCancel }) {
  const dialogRef = useRef(null);
  const confirmButtonRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      confirmButtonRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="confirmation-dialog-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-dialog-title"
    >
      <div className="confirmation-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 id="confirmation-dialog-title" className="confirmation-dialog-title">
          {title}
        </h3>
        <p className="confirmation-dialog-message">{message}</p>
        <div className="confirmation-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-danger"
            ref={confirmButtonRef}
            onClick={onConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

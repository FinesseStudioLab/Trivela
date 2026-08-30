import React from 'react';
import PropTypes from 'prop-types';
import './Toast.css';

/**
 * Toast Component
 *
 * A design system component for displaying notifications.
 * Can be used independently or via the ToastProvider context.
 */
export const Toast = ({
  id,
  type = 'info',
  message,
  onDismiss,
  role,
  className = '',
  ...props
}) => {
  const computedRole = role || (type === 'error' ? 'alert' : 'status');

  return (
    <div
      id={id}
      className={`toast toast-${type} ${className}`}
      role={computedRole}
      data-testid="toast"
      {...props}
    >
      <p className="toast-message">{message}</p>
      {onDismiss && (
        <button
          type="button"
          className="toast-dismiss"
          aria-label="Dismiss notification"
          onClick={onDismiss}
        >
          ✕
        </button>
      )}
    </div>
  );
};

Toast.propTypes = {
  id: PropTypes.string,
  type: PropTypes.oneOf(['success', 'error', 'info', 'warning']),
  message: PropTypes.node.isRequired,
  onDismiss: PropTypes.func,
  role: PropTypes.string,
  className: PropTypes.string,
};

export default Toast;

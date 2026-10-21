import React from 'react';

export function RewardBadge({ points = 50, label = 'pts', variant = 'default', size = 'medium' }) {
  const sizeStyles = {
    small: { fontSize: '0.75rem', padding: '2px 8px' },
    medium: { fontSize: '0.875rem', padding: '4px 10px' },
    large: { fontSize: '1rem', padding: '6px 14px' },
  };

  const variantStyles = {
    default: {
      background: 'rgba(76, 141, 255, 0.16)',
      color: '#4c8dff',
      border: '1px solid rgba(76, 141, 255, 0.32)',
    },
    success: {
      background: 'rgba(51, 195, 127, 0.16)',
      color: '#33c37f',
      border: '1px solid rgba(51, 195, 127, 0.32)',
    },
    warning: {
      background: 'rgba(245, 158, 11, 0.16)',
      color: '#f59e0b',
      border: '1px solid rgba(245, 158, 11, 0.32)',
    },
    claimed: {
      background: 'rgba(161, 177, 199, 0.16)',
      color: '#a1b1c7',
      border: '1px solid rgba(161, 177, 199, 0.32)',
    },
  };

  return (
    <span
      className={`reward-badge reward-badge--${variant}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        borderRadius: '9999px',
        fontWeight: 600,
        ...sizeStyles[size],
        ...variantStyles[variant],
      }}
    >
      <span aria-hidden="true">★</span>
      <span>
        {points} {label}
      </span>
    </span>
  );
}

export default RewardBadge;

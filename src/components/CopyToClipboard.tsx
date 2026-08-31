import React, { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';

export interface CopyToClipboardProps {
  text: string;
  label?: string;
  successMessage?: string;
  errorMessage?: string;
  className?: string;
  iconClassName?: string;
  showLabel?: boolean;
  ariaLabel?: string;
  onCopy?: () => void;
}

/**
 * Toast-safe copy-to-clipboard component
 * Accessible, themeable, with visual feedback
 */
export const CopyToClipboard: React.FC<CopyToClipboardProps> = ({
  text,
  label = 'Copy',
  successMessage = 'Copied to clipboard!',
  errorMessage = 'Failed to copy',
  className = '',
  iconClassName = '',
  showLabel = true,
  ariaLabel,
  onCopy,
}) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      toast.success(successMessage);
      onCopy?.();

      // Reset copied state after 2 seconds
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error(errorMessage);
    }
  }, [text, successMessage, errorMessage, onCopy]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Support Enter and Space for accessibility
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleCopy();
      }
    },
    [handleCopy],
  );

  return (
    <button
      onClick={handleCopy}
      onKeyDown={handleKeyDown}
      className={`copy-to-clipboard ${isCopied ? 'copied' : ''} ${className}`}
      aria-label={ariaLabel || `Copy ${label}`}
      type="button"
      role="button"
      tabIndex={0}
    >
      <span className={`copy-icon ${iconClassName}`} aria-hidden="true">
        {isCopied ? (
          <CheckIcon />
        ) : (
          <CopyIcon />
        )}
      </span>
      {showLabel && <span className="copy-label">{isCopied ? 'Copied!' : label}</span>}
    </button>
  );
};

// Icon components
const CopyIcon: React.FC = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M13.5 5.5h-8A1.5 1.5 0 004 7v8a1.5 1.5 0 001.5 1.5h8A1.5 1.5 0 0015 15V7a1.5 1.5 0 00-1.5-1.5z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M11 5.5V3a1.5 1.5 0 00-1.5-1.5h-8A1.5 1.5 0 000 3v8A1.5 1.5 0 001.5 12.5H4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CheckIcon: React.FC = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M13.5 4L6 11.5 2.5 8"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Default styles (can be overridden via className)
export const copyToClipboardStyles = `
  .copy-to-clipboard {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    background-color: #ffffff;
    color: #374151;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .copy-to-clipboard:hover {
    background-color: #f9fafb;
    border-color: #d1d5db;
  }

  .copy-to-clipboard:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }

  .copy-to-clipboard:active {
    transform: scale(0.98);
  }

  .copy-to-clipboard.copied {
    background-color: #dcfce7;
    border-color: #86efac;
    color: #166534;
  }

  .copy-icon {
    display: flex;
    align-items: center;
  }

  .copy-label {
    user-select: none;
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .copy-to-clipboard {
      background-color: #1f2937;
      border-color: #374151;
      color: #f9fafb;
    }

    .copy-to-clipboard:hover {
      background-color: #374151;
      border-color: #4b5563;
    }

    .copy-to-clipboard.copied {
      background-color: #064e3b;
      border-color: #059669;
      color: #d1fae5;
    }
  }
`;

import React from 'react';
import { CopyToClipboard } from './CopyToClipboard';

export interface AddressDisplayProps {
  address: string;
  label?: string;
  truncate?: boolean;
  showCopy?: boolean;
  showExplorerLink?: boolean;
  explorerBaseUrl?: string;
  className?: string;
  ariaLabel?: string;
}

/**
 * Address / Contract ID display component with truncation + explorer link
 * Accessible, themeable, with copy functionality
 */
export const AddressDisplay: React.FC<AddressDisplayProps> = ({
  address,
  label,
  truncate = true,
  showCopy = true,
  showExplorerLink = true,
  explorerBaseUrl = 'https://stellar.expert/explorer/public',
  className = '',
  ariaLabel,
}) => {
  const truncateAddress = (addr: string): string => {
    if (!truncate || addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const displayAddress = truncate ? truncateAddress(address) : address;
  const explorerUrl = `${explorerBaseUrl}/account/${address}`;

  return (
    <div
      className={`address-display ${className}`}
      role="group"
      aria-label={ariaLabel || `Address: ${address}`}
    >
      {label && <span className="address-label">{label}</span>}
      
      <div className="address-content">
        <code className="address-value" title={address}>
          {displayAddress}
        </code>

        <div className="address-actions">
          {showCopy && (
            <CopyToClipboard
              text={address}
              label=""
              showLabel={false}
              successMessage="Address copied!"
              ariaLabel="Copy address to clipboard"
              className="address-copy-btn"
            />
          )}

          {showExplorerLink && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="address-explorer-link"
              aria-label="View address on Stellar Explorer"
            >
              <ExplorerIcon />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

// Explorer icon component
const ExplorerIcon: React.FC = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M12 8.667V12.667C12 13.0203 11.8595 13.3594 11.6095 13.6095C11.3594 13.8595 11.0203 14 10.667 14H3.333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.667V5.333C2 4.97971 2.14048 4.64057 2.39052 4.39052C2.64057 4.14048 2.97971 4 3.333 4H7.333"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10 2H14V6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6.667 9.333L14 2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Default styles
export const addressDisplayStyles = `
  .address-display {
    display: inline-flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .address-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .address-content {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background-color: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
  }

  .address-value {
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
    color: #111827;
    user-select: all;
  }

  .address-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .address-copy-btn,
  .address-explorer-link {
    padding: 0.25rem;
    border-radius: 0.25rem;
    color: #6b7280;
    transition: color 0.2s;
    cursor: pointer;
    border: none;
    background: transparent;
  }

  .address-copy-btn:hover,
  .address-explorer-link:hover {
    color: #111827;
  }

  .address-copy-btn:focus,
  .address-explorer-link:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }

  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .address-label {
      color: #9ca3af;
    }

    .address-content {
      background-color: #1f2937;
      border-color: #374151;
    }

    .address-value {
      color: #f9fafb;
    }

    .address-copy-btn,
    .address-explorer-link {
      color: #9ca3af;
    }

    .address-copy-btn:hover,
    .address-explorer-link:hover {
      color: #f9fafb;
    }
  }
`;

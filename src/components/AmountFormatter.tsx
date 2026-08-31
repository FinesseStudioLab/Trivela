import React from 'react';

export interface AmountFormatterProps {
  amount: number | string;
  asset?: string;
  decimals?: number;
  locale?: string;
  showAsset?: boolean;
  className?: string;
  ariaLabel?: string;
  compact?: boolean;
}

/**
 * Amount / token formatter component with locale-aware formatting
 * Accessible, themeable, with proper decimal handling
 */
export const AmountFormatter: React.FC<AmountFormatterProps> = ({
  amount,
  asset = 'USDC',
  decimals = 7,
  locale = 'en-US',
  showAsset = true,
  className = '',
  ariaLabel,
  compact = false,
}) => {
  const formatAmount = (): string => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

    if (isNaN(numAmount)) {
      return '0';
    }

    if (compact && Math.abs(numAmount) >= 1000) {
      return formatCompact(numAmount);
    }

    return numAmount.toLocaleString(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  };

  const formatCompact = (num: number): string => {
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';

    if (absNum >= 1e9) {
      return `${sign}${(absNum / 1e9).toFixed(2)}B`;
    } else if (absNum >= 1e6) {
      return `${sign}${(absNum / 1e6).toFixed(2)}M`;
    } else if (absNum >= 1e3) {
      return `${sign}${(absNum / 1e3).toFixed(2)}K`;
    }

    return num.toLocaleString(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  const formattedAmount = formatAmount();
  const fullAmount = typeof amount === 'string' ? amount : amount.toString();

  return (
    <span
      className={`amount-formatter ${className}`}
      aria-label={ariaLabel || `Amount: ${fullAmount} ${asset}`}
      title={`${fullAmount} ${asset}`}
    >
      <span className="amount-value">{formattedAmount}</span>
      {showAsset && <span className="amount-asset">{asset}</span>}
    </span>
  );
};

// Variant for displaying USD equivalent
export interface AmountWithUSDProps extends AmountFormatterProps {
  usdRate?: number;
  showUSD?: boolean;
}

export const AmountWithUSD: React.FC<AmountWithUSDProps> = ({
  amount,
  asset = 'USDC',
  usdRate = 1,
  showUSD = true,
  decimals = 7,
  locale = 'en-US',
  showAsset = true,
  className = '',
  compact = false,
}) => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  const usdValue = numAmount * usdRate;

  return (
    <div className={`amount-with-usd ${className}`}>
      <AmountFormatter
        amount={amount}
        asset={asset}
        decimals={decimals}
        locale={locale}
        showAsset={showAsset}
        compact={compact}
        className="primary-amount"
      />
      {showUSD && usdRate !== 1 && (
        <span className="usd-equivalent">
          ≈ ${usdValue.toLocaleString(locale, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      )}
    </div>
  );
};

// Default styles
export const amountFormatterStyles = `
  .amount-formatter {
    display: inline-flex;
    align-items: baseline;
    gap: 0.25rem;
    font-variant-numeric: tabular-nums;
  }

  .amount-value {
    font-weight: 600;
    color: #111827;
  }

  .amount-asset {
    font-size: 0.875em;
    font-weight: 500;
    color: #6b7280;
    text-transform: uppercase;
  }

  .amount-with-usd {
    display: inline-flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .primary-amount {
    font-size: 1rem;
  }

  .usd-equivalent {
    font-size: 0.75rem;
    color: #6b7280;
  }

  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .amount-value {
      color: #f9fafb;
    }

    .amount-asset,
    .usd-equivalent {
      color: #9ca3af;
    }
  }

  /* Accessibility: ensure sufficient color contrast */
  @media (prefers-contrast: high) {
    .amount-value {
      color: #000000;
    }

    .amount-asset,
    .usd-equivalent {
      color: #4b5563;
    }

    @media (prefers-color-scheme: dark) {
      .amount-value {
        color: #ffffff;
      }

      .amount-asset,
      .usd-equivalent {
        color: #d1d5db;
      }
    }
  }
`;

import './AmountFormatter.css';
import { formatTokenAmount } from '../lib/amountFormatter';

export default function AmountFormatter({
  value,
  locale = 'en-US',
  tokenSymbol = 'pts',
  tokenDecimals = 0,
  minimumFractionDigits = 0,
  maximumFractionDigits = 2,
  compact = false,
  signDisplay = 'auto',
  fallback = '—',
  tone = 'default',
  className = '',
  ariaLabel,
}) {
  const label = formatTokenAmount(value, {
    locale,
    tokenSymbol,
    tokenDecimals,
    minimumFractionDigits,
    maximumFractionDigits,
    compact,
    signDisplay,
    fallback,
  });

  const classes = ['amount-formatter', `amount-formatter--${tone}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} aria-label={ariaLabel || label}>
      <span className="amount-formatter-value">{label}</span>
    </span>
  );
}

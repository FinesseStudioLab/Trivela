const DEFAULT_TOKEN_SYMBOL = 'pts';
const DEFAULT_FALLBACK = '—';

function clampFractionDigits(value, fallback) {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, 0), 20);
}

function normalizeAmount(value, tokenDecimals) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return null;
  }

  const scale = clampFractionDigits(tokenDecimals, 0);
  return scale > 0 ? amount / 10 ** scale : amount;
}

export function formatTokenAmount(
  value,
  {
    locale = 'en-US',
    tokenSymbol = DEFAULT_TOKEN_SYMBOL,
    tokenDecimals = 0,
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
    compact = false,
    signDisplay = 'auto',
    fallback = DEFAULT_FALLBACK,
  } = {},
) {
  const amount = normalizeAmount(value, tokenDecimals);
  if (amount === null) {
    return fallback;
  }

  const minFractionDigits = clampFractionDigits(minimumFractionDigits, 0);
  const maxFractionDigits = Math.max(
    minFractionDigits,
    clampFractionDigits(maximumFractionDigits, 2),
  );

  const formatter = new Intl.NumberFormat(locale, {
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
    signDisplay,
  });

  const formattedAmount = formatter.format(amount);
  return tokenSymbol ? `${formattedAmount} ${tokenSymbol}` : formattedAmount;
}

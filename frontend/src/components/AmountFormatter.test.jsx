import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { formatTokenAmount } from '../lib/amountFormatter';
import AmountFormatter from './AmountFormatter';

describe('formatTokenAmount', () => {
  it('formats locale-aware token values with fractional digits', () => {
    expect(formatTokenAmount(1234.567, { tokenSymbol: 'pts' })).toBe('1,234.57 pts');
    expect(formatTokenAmount(25, { tokenSymbol: 'pts' })).toBe('25 pts');
  });

  it('scales raw integer token amounts when tokenDecimals is provided', () => {
    expect(
      formatTokenAmount('1234567', {
        tokenSymbol: 'USDC',
        tokenDecimals: 6,
        maximumFractionDigits: 4,
      }),
    ).toBe('1.2346 USDC');
  });

  it('supports compact notation and explicit sign display', () => {
    expect(
      formatTokenAmount(1500000, {
        tokenSymbol: 'XLM',
        compact: true,
        signDisplay: 'always',
      }),
    ).toBe('+1.5M XLM');
  });

  it('returns a fallback for empty or invalid values', () => {
    expect(formatTokenAmount(null)).toBe('—');
    expect(formatTokenAmount('not-a-number', { fallback: 'n/a' })).toBe('n/a');
  });
});

describe('AmountFormatter', () => {
  it('renders an accessible formatted amount', () => {
    render(<AmountFormatter value={42} tokenSymbol="pts" ariaLabel="Campaign reward" />);

    expect(screen.getByLabelText('Campaign reward').textContent).toBe('42 pts');
  });

  it('applies tone classes for design-system usage', () => {
    render(<AmountFormatter value={12} tokenSymbol="XLM" tone="accent" />);

    expect(screen.getByLabelText('12 XLM').classList.contains('amount-formatter--accent')).toBe(
      true,
    );
  });
});

import React from 'react';
import { render, screen } from '@testing-library/react';
import { AmountFormatter, AmountWithUSD } from './AmountFormatter';

describe('AmountFormatter', () => {
  it('renders amount with asset', () => {
    render(<AmountFormatter amount={100.5} asset="USDC" />);
    expect(screen.getByText('100.5')).toBeInTheDocument();
    expect(screen.getByText('USDC')).toBeInTheDocument();
  });

  it('formats with correct decimals', () => {
    render(<AmountFormatter amount={1234.5678901} decimals={7} />);
    expect(screen.getByText(/1,234.567890/)).toBeInTheDocument();
  });

  it('formats compact notation for large numbers', () => {
    render(<AmountFormatter amount={1500000} compact={true} />);
    expect(screen.getByText(/1.50M/)).toBeInTheDocument();
  });

  it('is accessible with aria-label', () => {
    const { container } = render(<AmountFormatter amount={100} asset="XLM" />);
    const element = container.querySelector('[aria-label]');
    expect(element).toHaveAttribute('aria-label', 'Amount: 100 XLM');
  });
});

describe('AmountWithUSD', () => {
  it('shows USD equivalent', () => {
    render(<AmountWithUSD amount={100} asset="XLM" usdRate={0.5} showUSD={true} />);
    expect(screen.getByText(/\$50.00/)).toBeInTheDocument();
  });
});

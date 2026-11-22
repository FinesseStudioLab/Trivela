import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CampaignRoiCalculator from './CampaignRoiCalculator';

describe('CampaignRoiCalculator', () => {
  it('renders the calculator', () => {
    render(<CampaignRoiCalculator />);
    expect(screen.getByTestId('roi-calculator')).toBeDefined();
    expect(screen.getByText('Campaign ROI Calculator')).toBeDefined();
  });

  it('computes results from user input', () => {
    render(<CampaignRoiCalculator />);
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '1000' } });
    fireEvent.change(inputs[1], { target: { value: '5' } });
    fireEvent.change(inputs[2], { target: { value: '100' } });
    fireEvent.change(inputs[3], { target: { value: '20' } });

    const results = screen.getByTestId('roi-results');
    expect(results.textContent).toContain('500');
    expect(results.textContent).toContain('20');
    expect(results.textContent).toContain('ROI');
  });

  it('shows zero values when inputs are empty', () => {
    render(<CampaignRoiCalculator />);
    const results = screen.getByTestId('roi-results');
    expect(results.textContent).toContain('0');
  });

  it('handles invalid negative input gracefully', () => {
    render(<CampaignRoiCalculator />);
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '-5' } });
    fireEvent.change(inputs[1], { target: { value: 'abc' } });
    const results = screen.getByTestId('roi-results');
    expect(results.textContent).toContain('0');
  });
});

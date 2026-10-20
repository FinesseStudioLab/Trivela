import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CampaignMap, { REGIONS } from './CampaignMap';

const HOTSPOTS = [
  { region: 'europe', count: 40 },
  { region: 'asia', count: 25 },
  { region: 'north-america', count: 10 },
];

describe('CampaignMap', () => {
  it('renders the map with all regions by default', () => {
    render(<CampaignMap hotspots={HOTSPOTS} />);
    expect(screen.getByTestId('campaign-map')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /world map/i })).toBeInTheDocument();
    for (const region of REGIONS) {
      expect(screen.getByRole('button', { name: region.label })).toBeInTheDocument();
      expect(document.querySelector(`[data-region="${region.id}"]`)).toBeInTheDocument();
    }
  });

  it('shows total participants across all regions', () => {
    render(<CampaignMap hotspots={HOTSPOTS} />);
    expect(screen.getByText(/75 total participants/)).toBeInTheDocument();
  });

  it('filters to a single region when a region button is clicked', () => {
    render(<CampaignMap hotspots={HOTSPOTS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Europe' }));
    expect(screen.getByText(/40 participants in Europe/)).toBeInTheDocument();
    expect(document.querySelector('[data-region="europe"]')).toBeInTheDocument();
    expect(document.querySelector('[data-region="asia"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-region="oceania"]')).not.toBeInTheDocument();
  });

  it('calls onRegionChange when a region is selected', () => {
    const onRegionChange = vi.fn();
    render(<CampaignMap hotspots={HOTSPOTS} onRegionChange={onRegionChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Asia' }));
    expect(onRegionChange).toHaveBeenCalledWith('asia');
  });

  it('renders zero counts for regions without hotspot data', () => {
    render(<CampaignMap hotspots={[]} />);
    expect(screen.getByText(/0 total participants/)).toBeInTheDocument();
  });
});

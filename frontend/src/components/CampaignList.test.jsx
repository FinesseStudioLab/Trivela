import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CampaignList from './CampaignList';

describe('CampaignList', () => {
  it('shows empty state', () => {
    render(<CampaignList campaigns={[]} />);
    expect(screen.getByText(/no campaigns/i)).toBeInTheDocument();
  });

  it('renders campaigns', () => {
    render(<CampaignList campaigns={[{ id: 1, title: 'Test Campaign' }]} />);

    expect(screen.getByText('Test Campaign')).toBeInTheDocument();
  });
  it('renders multiple campaigns', () => {
    render(
      <CampaignList
        campaigns={[
          { id: 1, title: 'A' },
          { id: 2, title: 'B' },
        ]}
      />,
    );

    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });
});

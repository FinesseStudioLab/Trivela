import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import CampaignDetail from './CampaignDetail';

// Mock child components or hooks that require external setup
vi.mock('./hooks/useCampaignLiveUpdates', () => ({
  useCampaignLiveUpdates: () => ({
    campaign: null,
    onChainState: null,
    isPolling: false,
    isPaused: false,
    lastUpdated: null,
    stateToast: '',
    error: '',
    refresh: vi.fn(),
    connectionStatus: 'open',
  }),
}));

vi.mock('./components/PageMeta', () => ({
  default: () => <div data-testid="page-meta" />,
}));

vi.mock('./components/Header', () => ({
  default: () => <div data-testid="header" />,
}));

vi.mock('./components/StatusBadge', () => ({
  default: ({ status }) => <div data-testid="status-badge">{status}</div>,
}));

vi.mock('./components/TaskProgressBar', () => ({
  default: () => <div data-testid="task-progress-bar" />,
}));

vi.mock('./components/EmbedSnippetGenerator.jsx', () => ({
  default: () => <div data-testid="embed-snippet" />,
}));

function renderWithRouter(ui, { route = '/campaign/123' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/campaign/:id" element={ui} />
        <Route path="/" element={<div>Landing</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CampaignDetail', () => {
  it('renders loading skeleton snapshot when campaign data is loading / undefined', () => {
    const { container } = renderWithRouter(
      <CampaignDetail campaign={undefined} loading={true} error="" />,
    );
    expect(screen.getByLabelText(/loading campaign details/i)).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('renders fallback error state without crashing when campaign data is undefined and not loading', () => {
    const { container } = renderWithRouter(
      <CampaignDetail campaign={undefined} loading={false} error="" />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/campaign not found/i)).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('renders error state snapshot when error is passed', () => {
    const { container } = renderWithRouter(
      <CampaignDetail campaign={undefined} loading={false} error="Failed to fetch campaign" />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Failed to fetch campaign')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('renders campaign details when campaign data is provided', () => {
    const mockCampaign = {
      id: '123',
      name: 'Test Stellar Campaign',
      description: 'A test campaign for rewards',
      status: 'active',
      rewardPerAction: 50,
      createdAt: '2026-01-01T00:00:00.000Z',
      tasks: [{ id: 't1', title: 'Task 1', completed: true }],
      referralBonusPoints: 10,
    };

    const { container } = renderWithRouter(
      <CampaignDetail campaign={mockCampaign} loading={false} error="" />,
    );
    expect(screen.getByText('Test Stellar Campaign')).toBeInTheDocument();
    expect(screen.getByText('Campaign #123')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });
});

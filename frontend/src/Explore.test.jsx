// Unit tests for Explore's campaign search, filter, sort, category, and
// pagination behavior (#919). Mirrors Landing.test.jsx's setup: Explore
// renders Header (NotificationCenter is an apiClient consumer) and PageMeta
// (needs react-helmet-async), plus its own trending/new campaign rails.

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Explore from './Explore';
import { I18nProvider } from './lib/i18n';
import { apiClient } from './lib/apiClient';

vi.mock('./lib/apiClient', () => ({
  apiClient: {
    getCampaigns: vi.fn(),
    getTrendingCampaigns: vi.fn(),
    getNewCampaigns: vi.fn(),
    getNotifications: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

vi.mock('./components/OnboardingTour', () => ({
  default: () => null,
  useRestartTour: () => ({ restartRef: { current: null }, restart: () => {} }),
}));

function makeCampaign(overrides = {}) {
  return {
    id: 'c1',
    name: 'Airdrop Alpha',
    featured: false,
    ...overrides,
  };
}

function makePayload(campaigns, paginationOverrides = {}) {
  return {
    data: campaigns,
    pagination: {
      total: campaigns.length,
      count: campaigns.length,
      page: 1,
      limit: 9,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
      previousPage: null,
      nextPage: null,
      ...paginationOverrides,
    },
  };
}

function renderExplore(initialEntries = ['/explore']) {
  return render(
    <HelmetProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <Explore />
        </MemoryRouter>
      </I18nProvider>
    </HelmetProvider>,
  );
}

describe('Explore campaign list (#919)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.getNotifications.mockResolvedValue({ data: [] });
    apiClient.getTrendingCampaigns.mockResolvedValue({ data: [] });
    apiClient.getNewCampaigns.mockResolvedValue({ data: [] });
  });

  it('fetches and renders campaigns on mount with default paging', async () => {
    apiClient.getCampaigns.mockResolvedValue(makePayload([makeCampaign()]));

    renderExplore();

    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(1));
    expect(apiClient.getCampaigns).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 9 }),
    );
    expect(await screen.findByText('Airdrop Alpha')).toBeInTheDocument();
  });

  it('debounces search input, resets to page 1, and refetches with the query', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apiClient.getCampaigns.mockResolvedValue(makePayload([makeCampaign()]));

    renderExplore();
    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(1));

    const input = await screen.findByLabelText(/search campaigns/i);
    fireEvent.change(input, { target: { value: 'airdrop' } });

    await vi.advanceTimersByTimeAsync(300);

    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(2));
    expect(apiClient.getCampaigns).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, q: 'airdrop' }),
    );

    vi.useRealTimers();
  });

  it('toggling active-only refetches with active=true', async () => {
    apiClient.getCampaigns.mockResolvedValue(makePayload([makeCampaign()]));

    renderExplore();
    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(1));

    const toggle = await screen.findByLabelText(/active only/i);
    fireEvent.click(toggle);

    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(2));
    expect(apiClient.getCampaigns).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, active: true }),
    );
  });

  it('changing sort maps the UI key to the backend sort/order params', async () => {
    apiClient.getCampaigns.mockResolvedValue(makePayload([makeCampaign()]));

    renderExplore();
    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(1));

    const sortSelect = await screen.findByLabelText(/sort/i);
    fireEvent.change(sortSelect, { target: { value: 'reward_desc' } });

    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(2));
    expect(apiClient.getCampaigns).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'reward_per_action', order: 'desc', page: 1 }),
    );
  });

  it('hydrates the category filter from the URL, fetches with it, and clears it on demand', async () => {
    apiClient.getCampaigns.mockResolvedValue(makePayload([makeCampaign()]));

    renderExplore(['/explore?category=nfts&page=2']);

    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(1));
    expect(apiClient.getCampaigns).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: 'nfts', page: 2 }),
    );
    expect(screen.getByText('nfts')).toBeInTheDocument();

    apiClient.getCampaigns.mockResolvedValue(makePayload([makeCampaign()]));
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(2));
    expect(apiClient.getCampaigns).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: undefined, page: 1 }),
    );
    expect(screen.queryByText('nfts')).not.toBeInTheDocument();
  });

  it('paginates forward and back, disabling buttons at the boundaries', async () => {
    apiClient.getCampaigns.mockResolvedValueOnce(
      makePayload([makeCampaign()], {
        page: 1,
        totalPages: 2,
        hasPreviousPage: false,
        hasNextPage: true,
        nextPage: 2,
      }),
    );

    renderExplore();
    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(1));

    const nextButton = await screen.findByRole('button', { name: /next page/i });
    const previousButton = screen.getByRole('button', { name: /previous page/i });
    expect(previousButton).toBeDisabled();
    expect(nextButton).not.toBeDisabled();

    apiClient.getCampaigns.mockResolvedValueOnce(
      makePayload([makeCampaign({ id: 'c2', name: 'Airdrop Beta' })], {
        page: 2,
        totalPages: 2,
        hasPreviousPage: true,
        hasNextPage: false,
        previousPage: 1,
      }),
    );

    fireEvent.click(nextButton);

    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(2));
    expect(apiClient.getCampaigns).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    expect(await screen.findByText('Airdrop Beta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
  });

  it('renders a no-campaigns-yet empty state when the list is empty with no filters', async () => {
    apiClient.getCampaigns.mockResolvedValue(makePayload([]));

    renderExplore();

    expect(await screen.findByText(/no campaigns yet/i)).toBeInTheDocument();
  });

  it('renders a clear-filters empty state when filters produce no results, and clearing them refetches', async () => {
    apiClient.getCampaigns.mockResolvedValue(makePayload([]));

    renderExplore();
    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(1));

    const toggle = await screen.findByLabelText(/active only/i);
    fireEvent.click(toggle);

    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/no campaigns found/i)).toBeInTheDocument();

    apiClient.getCampaigns.mockResolvedValue(makePayload([makeCampaign()]));
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));

    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(3));
    expect(apiClient.getCampaigns).toHaveBeenLastCalledWith(
      expect.objectContaining({ active: undefined, q: undefined, category: undefined }),
    );
  });

  it('renders an error state on fetch failure and retries on demand', async () => {
    apiClient.getCampaigns.mockRejectedValueOnce(new Error('network down'));

    renderExplore();

    expect(await screen.findByText(/we couldn.t load campaigns/i)).toBeInTheDocument();

    apiClient.getCampaigns.mockResolvedValueOnce(makePayload([makeCampaign()]));
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Airdrop Alpha')).toBeInTheDocument();
  });

  it('renders trending and new campaign rails from their own endpoints', async () => {
    apiClient.getCampaigns.mockResolvedValue(makePayload([makeCampaign()]));
    apiClient.getTrendingCampaigns.mockResolvedValue({
      data: [makeCampaign({ id: 't1', name: 'Trending One' })],
    });
    apiClient.getNewCampaigns.mockResolvedValue({
      data: [makeCampaign({ id: 'n1', name: 'New One' })],
    });

    renderExplore();

    expect(await screen.findByText('Trending One')).toBeInTheDocument();
    expect(await screen.findByText('New One')).toBeInTheDocument();
  });
});

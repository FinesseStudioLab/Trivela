// Unit tests for Landing's campaign search, filter, sort, and pagination
// behavior (#919). Landing renders Header (which pulls in NotificationCenter,
// itself an apiClient consumer), so the whole apiClient module is mocked here
// rather than just getCampaigns.

import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Landing from './Landing';
import { I18nProvider } from './lib/i18n';
import { apiClient } from './lib/apiClient';

vi.mock('./lib/apiClient', () => ({
  apiClient: {
    getCampaigns: vi.fn(),
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
      limit: 6,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
      previousPage: null,
      nextPage: null,
      ...paginationOverrides,
    },
  };
}

function renderLanding() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/']}>
        <Landing />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('Landing campaign list (#919)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.getNotifications.mockResolvedValue({ data: [] });
  });

  it('fetches and renders campaigns on mount with default paging', async () => {
    apiClient.getCampaigns.mockResolvedValue(makePayload([makeCampaign()]));

    renderLanding();

    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(1));
    expect(apiClient.getCampaigns).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 6 }),
    );
    expect(await screen.findByText('Airdrop Alpha')).toBeInTheDocument();
  });

  it('debounces search input, resets to page 1, and refetches with the query', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apiClient.getCampaigns.mockResolvedValue(makePayload([makeCampaign()]));

    renderLanding();
    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(1));

    const input = await screen.findByLabelText(/search campaigns/i);
    act(() => {
      fireEvent.change(input, { target: { value: 'airdrop' } });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(2));
    expect(apiClient.getCampaigns).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, q: 'airdrop' }),
    );

    vi.useRealTimers();
  });

  it('toggling active-only refetches with active=true', async () => {
    apiClient.getCampaigns.mockResolvedValue(makePayload([makeCampaign()]));

    renderLanding();
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

    renderLanding();
    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(1));

    const sortSelect = await screen.findByLabelText(/sort/i);
    fireEvent.change(sortSelect, { target: { value: 'reward_desc' } });

    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(2));
    expect(apiClient.getCampaigns).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'reward_per_action', order: 'desc', page: 1 }),
    );
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

    renderLanding();
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

    renderLanding();

    expect(await screen.findByText(/no campaigns yet/i)).toBeInTheDocument();
  });

  it('renders a clear-filters empty state when filters produce no results, and clearing them refetches', async () => {
    apiClient.getCampaigns.mockResolvedValue(makePayload([]));

    renderLanding();
    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(1));

    const toggle = await screen.findByLabelText(/active only/i);
    fireEvent.click(toggle);

    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/no campaigns found/i)).toBeInTheDocument();

    apiClient.getCampaigns.mockResolvedValue(makePayload([makeCampaign()]));
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));

    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(3));
    expect(apiClient.getCampaigns).toHaveBeenLastCalledWith(
      expect.objectContaining({ active: undefined, q: undefined }),
    );
  });

  it('renders an error state on fetch failure and retries on demand', async () => {
    apiClient.getCampaigns.mockRejectedValueOnce(new Error('network down'));

    renderLanding();

    expect(await screen.findByText(/we couldn.t load campaigns/i)).toBeInTheDocument();

    apiClient.getCampaigns.mockResolvedValueOnce(makePayload([makeCampaign()]));
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(apiClient.getCampaigns).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Airdrop Alpha')).toBeInTheDocument();
  });
});

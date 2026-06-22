import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EmbedCampaign from '../pages/EmbedCampaign';

vi.mock('../config', () => ({
  apiUrl: (path) => `http://localhost:3001${path}`,
}));

const mockCampaign = {
  id: 'abc123',
  name: 'Test Campaign',
  description: 'A test campaign description',
  active: true,
  participantCount: 42,
  capacity: 100,
  rewardPerAction: 10,
};

function renderEmbed(id = 'abc123', search = '') {
  return render(
    <MemoryRouter initialEntries={[`/embed/campaign/${id}${search}`]}>
      <Routes>
        <Route path="/embed/campaign/:id" element={<EmbedCampaign />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EmbedCampaign', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ campaign: mockCampaign }),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state initially', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    renderEmbed();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders campaign name after fetch', async () => {
    renderEmbed();
    await waitFor(() => expect(screen.getByText('Test Campaign')).toBeInTheDocument());
  });

  it('renders participant count', async () => {
    renderEmbed();
    await waitFor(() => expect(screen.getByText(/42 participants/i)).toBeInTheDocument());
  });

  it('renders Register on Trivela button linking to full campaign', async () => {
    renderEmbed();
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /register on trivela/i });
      expect(link).toBeInTheDocument();
      expect(link.href).toContain('/campaign/abc123');
      expect(link.target).toBe('_blank');
    });
  });

  it('shows error state when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    renderEmbed();
    await waitFor(() => expect(screen.getByText(/campaign not found/i)).toBeInTheDocument());
  });

  it('truncates long descriptions', async () => {
    const longDesc = 'A'.repeat(200);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ campaign: { ...mockCampaign, description: longDesc } }),
      }),
    );
    renderEmbed();
    await waitFor(() => {
      const desc = screen.getByText(/A+\u2026/);
      expect(desc.textContent.length).toBeLessThanOrEqual(121);
    });
  });

  it('applies dark theme by default', async () => {
    renderEmbed('abc123', '');
    await waitFor(() => expect(screen.getByText('Test Campaign')).toBeInTheDocument());
    const container = document.querySelector('[style]');
    expect(container).toBeTruthy();
  });

  it('applies light theme when requested', async () => {
    renderEmbed('abc123', '?theme=light');
    await waitFor(() => expect(screen.getByText('Test Campaign')).toBeInTheDocument());
  });
});

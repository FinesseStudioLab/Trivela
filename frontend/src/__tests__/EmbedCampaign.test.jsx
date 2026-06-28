import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
    // Stub postMessage so tests don't throw cross-origin errors.
    vi.stubGlobal('parent', { postMessage: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Existing baseline tests ────────────────────────────────────────────────

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
      const desc = screen.getByText(/A+…/);
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

  // ── Partner attribution tests ──────────────────────────────────────────────

  it('includes ?ref=partner in register URL when valid partner is given', async () => {
    renderEmbed('abc123', '?partner=acme-dao');
    await waitFor(() => {
      const link = screen.getByTestId('register-link');
      expect(link.href).toContain('ref=acme-dao');
    });
  });

  it('does NOT include ref param when partner is absent', async () => {
    renderEmbed('abc123', '');
    await waitFor(() => {
      const link = screen.getByTestId('register-link');
      expect(link.href).not.toContain('ref=');
    });
  });

  it('ignores an invalid partner ID (special chars)', async () => {
    renderEmbed('abc123', '?partner=<script>bad()</script>');
    await waitFor(() => {
      const link = screen.getByTestId('register-link');
      expect(link.href).not.toContain('ref=');
      expect(link.href).not.toContain('script');
    });
  });

  it('ignores a partner ID that exceeds 64 characters', async () => {
    const longId = 'a'.repeat(65);
    renderEmbed('abc123', `?partner=${longId}`);
    await waitFor(() => {
      const link = screen.getByTestId('register-link');
      expect(link.href).not.toContain('ref=');
    });
  });

  // ── postMessage tests ──────────────────────────────────────────────────────

  it('fires trivela:ready postMessage after campaign loads', async () => {
    const mockPostMessage = vi.fn();
    vi.stubGlobal('parent', { postMessage: mockPostMessage });

    renderEmbed('abc123', '?partner=foo');
    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'trivela-widget',
          type: 'trivela:ready',
          payload: expect.objectContaining({ campaignId: 'abc123', partner: 'foo' }),
        }),
        expect.any(String),
      );
    });
  });

  it('fires trivela:register_click postMessage when register link is clicked', async () => {
    const mockPostMessage = vi.fn();
    vi.stubGlobal('parent', { postMessage: mockPostMessage });

    renderEmbed('abc123', '?partner=bar');
    await waitFor(() => screen.getByTestId('register-link'));

    fireEvent.click(screen.getByTestId('register-link'));

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'trivela-widget',
        type: 'trivela:register_click',
        payload: expect.objectContaining({ campaignId: 'abc123', partner: 'bar' }),
      }),
      expect.any(String),
    );
  });

  // ── Org branding tests ─────────────────────────────────────────────────────

  it('shows default "Powered by Trivela" when no org is given', async () => {
    renderEmbed('abc123');
    await waitFor(() => {
      expect(screen.getByText(/powered by trivela/i)).toBeInTheDocument();
    });
  });

  it('shows "Powered by OrgName via Trivela" when org param is given', async () => {
    renderEmbed('abc123', '?org=MyDAO');
    await waitFor(() => {
      expect(screen.getByText(/powered by mydao via trivela/i)).toBeInTheDocument();
    });
  });

  // ── Colour branding tests ─────────────────────────────────────────────────

  it('applies custom button colour from ?color param', async () => {
    renderEmbed('abc123', '?color=%23ff0000');
    await waitFor(() => {
      const link = screen.getByTestId('register-link');
      expect(link.style.background).toBe('rgb(255, 0, 0)');
    });
  });

  it('ignores invalid colour values', async () => {
    renderEmbed('abc123', '?color=javascript%3Aalert(1)');
    await waitFor(() => {
      const link = screen.getByTestId('register-link');
      // Should fall back to default indigo colour
      expect(link.style.background).not.toContain('javascript');
    });
  });
});

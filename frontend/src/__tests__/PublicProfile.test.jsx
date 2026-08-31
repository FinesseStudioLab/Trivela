import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import PublicProfile from '../pages/PublicProfile';

vi.mock('../config', () => ({
  apiUrl: (path) => `http://localhost:3001${path}`,
  SITE_URL: 'https://trivela.app',
  DEFAULT_OG_IMAGE: '/og-default.png',
}));

// Capture PageMeta props for OG-tag assertions without relying on jsdom's
// head manipulation, which react-helmet-async doesn't flush synchronously.
const capturedMeta = { current: null };
vi.mock('../components/PageMeta', () => ({
  default: (props) => {
    capturedMeta.current = props;
    return null;
  },
}));

const TEST_ADDRESS = 'GABC1234DEFG5678HIJK9012LMNO3456PQRS7890TUVW1234XYZ56789ABC';

function renderProfile(address = TEST_ADDRESS) {
  capturedMeta.current = null;
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/u/${address}`]}>
        <Routes>
          <Route path="/u/:address" element={<PublicProfile />} />
          <Route path="/campaign/:id" element={<div>Campaign</div>} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

const mockPublicProfile = {
  address: TEST_ADDRESS,
  isPublic: true,
  handle: 'stellar-pioneer',
  reputation: 1250,
  streak: { current: 7, longest: 14 },
  joinedAt: '2025-03-01T00:00:00.000Z',
  badges: [
    { id: 'early-adopter', name: 'Early Adopter', description: 'Joined in the first wave' },
    { id: 'streak-7', name: '7-Day Streak', description: 'Active 7 days in a row' },
  ],
  campaigns: [
    { id: 1, name: 'Alpha Launch', joinedAt: '2025-03-15T00:00:00.000Z', rewardEarned: 500 },
    { id: 2, name: 'Beta Rewards', joinedAt: '2025-04-01T00:00:00.000Z', rewardEarned: 300 },
  ],
};

describe('PublicProfile', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPublicProfile),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows a loading indicator while fetching', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    renderProfile();
    expect(screen.getByTestId('profile-loading')).toBeInTheDocument();
  });

  // ── Full public profile ────────────────────────────────────────────────────

  it('renders the profile view after a successful fetch', async () => {
    renderProfile();
    await waitFor(() => expect(screen.getByTestId('profile-view')).toBeInTheDocument());
  });

  it('renders the participant handle', async () => {
    renderProfile();
    await waitFor(() => expect(screen.getByText('stellar-pioneer')).toBeInTheDocument());
  });

  it('renders reputation and streak stats', async () => {
    renderProfile();
    await waitFor(() => {
      expect(screen.getByTestId('profile-stats')).toBeInTheDocument();
      expect(screen.getByText('1250')).toBeInTheDocument();
    });
  });

  it('renders badge chips for each badge', async () => {
    renderProfile();
    await waitFor(() => {
      const badges = screen.getByTestId('profile-badges');
      expect(badges).toBeInTheDocument();
      expect(screen.getByText('Early Adopter')).toBeInTheDocument();
      expect(screen.getByText('7-Day Streak')).toBeInTheDocument();
    });
  });

  it('renders campaign history rows', async () => {
    renderProfile();
    await waitFor(() => {
      expect(screen.getByTestId('profile-campaigns')).toBeInTheDocument();
      expect(screen.getByText('Alpha Launch')).toBeInTheDocument();
      expect(screen.getByText('Beta Rewards')).toBeInTheDocument();
    });
  });

  // ── OG meta tags ──────────────────────────────────────────────────────────

  it('passes the participant handle and stats to PageMeta for OG sharing', async () => {
    renderProfile();
    await waitFor(() => screen.getByTestId('profile-view'));
    expect(capturedMeta.current?.title).toMatch(/stellar-pioneer/i);
    expect(capturedMeta.current?.description).toMatch(/reputation/i);
    expect(capturedMeta.current?.path).toBe(`/u/${TEST_ADDRESS}`);
    expect(capturedMeta.current?.type).toBe('profile');
  });

  // ── Privacy opt-out ───────────────────────────────────────────────────────

  it('shows a private profile card when isPublic is false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...mockPublicProfile, isPublic: false }),
      }),
    );
    renderProfile();
    await waitFor(() => expect(screen.getByTestId('profile-private')).toBeInTheDocument());
    expect(screen.getByText(/private/i)).toBeInTheDocument();
  });

  it('does not render badges or history for a private profile', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...mockPublicProfile, isPublic: false }),
      }),
    );
    renderProfile();
    await waitFor(() => screen.getByTestId('profile-private'));
    expect(screen.queryByTestId('profile-badges')).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-campaigns')).not.toBeInTheDocument();
  });

  // ── 404 / not-found ───────────────────────────────────────────────────────

  it('shows not-found state when the API returns 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      }),
    );
    renderProfile();
    await waitFor(() => expect(screen.getByTestId('profile-not-found')).toBeInTheDocument());
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  it('shows an empty state when the participant has no campaigns or badges', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ...mockPublicProfile,
            badges: [],
            campaigns: [],
          }),
      }),
    );
    renderProfile();
    await waitFor(() => expect(screen.getByTestId('profile-empty')).toBeInTheDocument());
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('shows an error state when the fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    renderProfile();
    await waitFor(() => expect(screen.getByTestId('profile-error')).toBeInTheDocument());
  });
});

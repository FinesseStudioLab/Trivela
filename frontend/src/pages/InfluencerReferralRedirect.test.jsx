import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import InfluencerReferralRedirect, { REFERRAL_STORAGE_KEY } from './InfluencerReferralRedirect';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/ref/:code" element={<InfluencerReferralRedirect />} />
        <Route path="/campaigns/:id" element={<p>campaign page</p>} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('InfluencerReferralRedirect', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('stores attribution and redirects to the campaign', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 'alice', influencerHandle: 'Alice', campaignId: '7' }),
      }),
    );
    renderAt('/ref/alice');
    await screen.findByText('campaign page');
    expect(JSON.parse(localStorage.getItem(REFERRAL_STORAGE_KEY))).toEqual({
      code: 'alice',
      influencerHandle: 'Alice',
    });
  });

  it('redirects home without storing for an unknown code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    renderAt('/ref/nobody');
    await waitFor(() => expect(screen.getByText('home page')).toBeTruthy());
    expect(localStorage.getItem(REFERRAL_STORAGE_KEY)).toBeNull();
  });
});

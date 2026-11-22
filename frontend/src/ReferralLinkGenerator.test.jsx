import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReferralLinkGenerator from './ReferralLinkGenerator';
import { ToastProvider } from './lib/toast/ToastProvider';

vi.mock('./components/Header', () => ({
  default: () => <div data-testid="header" />,
}));

vi.mock('qrcode.react', () => ({
  QRCodeCanvas: () => <div data-testid="qr-canvas" />,
}));

function renderWithRouter(ui, { route = '/campaign/c1/referrals' } = {}) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/campaign/:id/referrals" element={ui} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('ReferralLinkGenerator - clipboard fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/referrals/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ referralCount: 3, bonusEarned: 30 }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 'c1', name: 'Test Campaign', referralBonusPoints: 10 }),
      });
    });
  });

  it('copies successfully using navigator.clipboard.writeText when available', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    renderWithRouter(
      <ReferralLinkGenerator walletAddress="GBX...TEST" id="c1" />,
    );

    const copyBtn = await screen.findByRole('button', { name: /copy link/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('?ref=GBX...TEST'));
      expect(screen.getByRole('button', { name: /copied!/i })).toBeInTheDocument();
    });
  });

  it('falls back to document.execCommand when navigator.clipboard is unavailable', async () => {
    // Delete or set clipboard undefined to simulate non-HTTPS context or older browser
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const execCommandMock = vi.fn().mockReturnValue(true);
    document.execCommand = execCommandMock;

    try {
      renderWithRouter(
        <ReferralLinkGenerator walletAddress="GBX...TEST" id="c1" />,
      );

      const copyBtn = await screen.findByRole('button', { name: /copy link/i });
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(execCommandMock).toHaveBeenCalledWith('copy');
        expect(screen.getByRole('button', { name: /copied!/i })).toBeInTheDocument();
      });
    } finally {
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        configurable: true,
        writable: true,
      });
    }
  });

  it('shows an error toast prompting manual copy when both clipboard API and execCommand fail', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('Clipboard permission denied')),
      },
      configurable: true,
      writable: true,
    });

    const execCommandMock = vi.fn().mockReturnValue(false);
    document.execCommand = execCommandMock;

    renderWithRouter(
      <ReferralLinkGenerator walletAddress="GBX...TEST" id="c1" />,
    );

    const copyBtn = await screen.findByRole('button', { name: /copy link/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/unable to copy automatically\. please copy the link manually\./i),
      ).toBeInTheDocument();
    });
  });
});

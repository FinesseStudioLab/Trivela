import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HanaProvider } from './HanaProvider.js';

describe('HanaProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new HanaProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('getName', () => {
    it('returns Hana', () => {
      expect(provider.getName()).toBe('Hana');
    });
  });

  describe('isAvailable', () => {
    it('returns true when window.hana.stellar exists', async () => {
      vi.stubGlobal('window', { hana: { stellar: {} } });
      expect(await provider.isAvailable()).toBe(true);
    });

    it('returns false when window.hana is absent', async () => {
      vi.stubGlobal('window', {});
      expect(await provider.isAvailable()).toBe(false);
    });

    it('returns false when window.hana.stellar is absent', async () => {
      vi.stubGlobal('window', { hana: {} });
      expect(await provider.isAvailable()).toBe(false);
    });
  });

  describe('isConnected', () => {
    it('returns true when the extension reports connected', async () => {
      vi.stubGlobal('window', {
        hana: { stellar: { isConnected: vi.fn().mockResolvedValue(true) } },
      });
      expect(await provider.isConnected()).toBe(true);
    });

    it('returns false when the extension is absent', async () => {
      vi.stubGlobal('window', {});
      expect(await provider.isConnected()).toBe(false);
    });
  });

  describe('connect', () => {
    it('returns the public key on success', async () => {
      const mockConnect = vi.fn().mockResolvedValue({ publicKey: 'GABC123' });
      vi.stubGlobal('window', { hana: { stellar: { connect: mockConnect } } });
      expect(await provider.connect()).toBe('GABC123');
      expect(mockConnect).toHaveBeenCalledOnce();
    });

    it('throws when no public key is returned', async () => {
      vi.stubGlobal('window', {
        hana: { stellar: { connect: vi.fn().mockResolvedValue({}) } },
      });
      await expect(provider.connect()).rejects.toThrow('Hana did not return a wallet address.');
    });

    it('throws when wallet extension is absent', async () => {
      vi.stubGlobal('window', {});
      await expect(provider.connect()).rejects.toThrow('Hana wallet is unavailable');
    });
  });

  describe('disconnect', () => {
    it('calls disconnect on the extension if available', async () => {
      const mockDisconnect = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('window', {
        hana: { stellar: { disconnect: mockDisconnect } },
      });
      const result = await provider.disconnect();
      expect(result).toBe(true);
      expect(mockDisconnect).toHaveBeenCalledOnce();
    });

    it('returns true gracefully when extension is absent', async () => {
      vi.stubGlobal('window', {});
      expect(await provider.disconnect()).toBe(true);
    });
  });

  describe('getAddress', () => {
    it('returns publicKey from getPublicKey when available', async () => {
      vi.stubGlobal('window', {
        hana: { stellar: { getPublicKey: vi.fn().mockResolvedValue({ publicKey: 'GXYZ' }) } },
      });
      expect(await provider.getAddress()).toBe('GXYZ');
    });

    it('falls back to connect() when getPublicKey is absent', async () => {
      vi.stubGlobal('window', {
        hana: { stellar: { connect: vi.fn().mockResolvedValue({ publicKey: 'GFALLBACK' }) } },
      });
      expect(await provider.getAddress()).toBe('GFALLBACK');
    });

    it('throws when no address is retrievable', async () => {
      vi.stubGlobal('window', {
        hana: {
          stellar: {
            connect: vi.fn().mockResolvedValue({}),
          },
        },
      });
      await expect(provider.getAddress()).rejects.toThrow(
        'No address available. Please connect your wallet first.',
      );
    });
  });

  describe('signTransaction', () => {
    it('returns the signed XDR on success', async () => {
      const mockSign = vi.fn().mockResolvedValue({ signedTxXdr: 'SIGNED_XDR' });
      vi.stubGlobal('window', {
        hana: { stellar: { signTransaction: mockSign } },
      });
      const result = await provider.signTransaction('RAW_XDR', {
        networkPassphrase: 'Test SDF Network ; September 2015',
      });
      expect(result).toBe('SIGNED_XDR');
      expect(mockSign).toHaveBeenCalledWith('RAW_XDR', {
        networkPassphrase: 'Test SDF Network ; September 2015',
      });
    });

    it('throws when no signed XDR is returned', async () => {
      vi.stubGlobal('window', {
        hana: { stellar: { signTransaction: vi.fn().mockResolvedValue({}) } },
      });
      await expect(provider.signTransaction('XDR')).rejects.toThrow(
        'Hana did not return a signed transaction.',
      );
    });
  });
});

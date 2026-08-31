// Unit tests for RabetProvider (#1009)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RabetProvider } from './RabetProvider.js';

const TEST_ADDRESS = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZS4';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

function makeRabetApi({
  publicKey = TEST_ADDRESS,
  network = TESTNET_PASSPHRASE,
  signedXdr = 'signedXDR123',
} = {}) {
  return {
    connect: vi.fn().mockResolvedValue({ publicKey, network }),
    sign: vi.fn().mockResolvedValue({ xdr: signedXdr }),
  };
}

describe('RabetProvider (#1009)', () => {
  let provider;
  let originalRabet;

  beforeEach(() => {
    originalRabet = window.rabet;
    provider = new RabetProvider();
  });

  afterEach(() => {
    window.rabet = originalRabet;
    vi.restoreAllMocks();
  });

  describe('isAvailable()', () => {
    it('returns true when window.rabet is present', async () => {
      window.rabet = makeRabetApi();
      expect(await provider.isAvailable()).toBe(true);
    });

    it('returns false when window.rabet is absent', async () => {
      delete window.rabet;
      expect(await provider.isAvailable()).toBe(false);
    });
  });

  describe('isConnected()', () => {
    it('returns true when extension is injected', async () => {
      window.rabet = makeRabetApi();
      expect(await provider.isConnected()).toBe(true);
    });

    it('returns false when extension is absent', async () => {
      delete window.rabet;
      expect(await provider.isConnected()).toBe(false);
    });
  });

  describe('connect()', () => {
    it('returns the public key from Rabet', async () => {
      window.rabet = makeRabetApi();
      const address = await provider.connect();
      expect(address).toBe(TEST_ADDRESS);
    });

    it('throws a descriptive error when Rabet is not installed', async () => {
      delete window.rabet;
      await expect(provider.connect()).rejects.toThrow(/Rabet is not installed/);
    });

    it('throws when Rabet returns no publicKey', async () => {
      window.rabet = { connect: vi.fn().mockResolvedValue({}) };
      await expect(provider.connect()).rejects.toThrow(/did not return a wallet address/);
    });
  });

  describe('getAddress()', () => {
    it('returns the public key via connect', async () => {
      window.rabet = makeRabetApi();
      expect(await provider.getAddress()).toBe(TEST_ADDRESS);
    });

    it('throws when extension is absent', async () => {
      delete window.rabet;
      await expect(provider.getAddress()).rejects.toThrow(/Rabet is not installed/);
    });
  });

  describe('getNetwork()', () => {
    it('returns the network passphrase from Rabet', async () => {
      window.rabet = makeRabetApi({ network: MAINNET_PASSPHRASE });
      expect(await provider.getNetwork()).toBe(MAINNET_PASSPHRASE);
    });

    it('returns testnet passphrase when on testnet', async () => {
      window.rabet = makeRabetApi({ network: TESTNET_PASSPHRASE });
      expect(await provider.getNetwork()).toBe(TESTNET_PASSPHRASE);
    });

    it('throws when Rabet returns no network field', async () => {
      window.rabet = { connect: vi.fn().mockResolvedValue({ publicKey: TEST_ADDRESS }) };
      await expect(provider.getNetwork()).rejects.toThrow(/did not return a network passphrase/);
    });

    it('throws when Rabet is not installed', async () => {
      delete window.rabet;
      await expect(provider.getNetwork()).rejects.toThrow(/Rabet is not installed/);
    });
  });

  describe('signTransaction()', () => {
    it('signs a transaction and returns the signed XDR', async () => {
      const api = makeRabetApi({ signedXdr: 'signedABC' });
      window.rabet = api;
      const result = await provider.signTransaction('rawXDR', {
        networkPassphrase: TESTNET_PASSPHRASE,
      });
      expect(result).toBe('signedABC');
      expect(api.sign).toHaveBeenCalledWith('rawXDR', TESTNET_PASSPHRASE);
    });

    it('falls back to getNetwork() when no networkPassphrase option provided', async () => {
      const api = makeRabetApi({ network: TESTNET_PASSPHRASE, signedXdr: 'fallbackSigned' });
      window.rabet = api;
      const result = await provider.signTransaction('rawXDR');
      expect(result).toBe('fallbackSigned');
      // connect() was called once for getNetwork fallback
      expect(api.connect).toHaveBeenCalled();
    });

    it('throws when Rabet returns no signed XDR', async () => {
      window.rabet = {
        connect: vi
          .fn()
          .mockResolvedValue({ publicKey: TEST_ADDRESS, network: TESTNET_PASSPHRASE }),
        sign: vi.fn().mockResolvedValue({}),
      };
      await expect(
        provider.signTransaction('rawXDR', { networkPassphrase: TESTNET_PASSPHRASE }),
      ).rejects.toThrow(/did not return a signed transaction/);
    });

    it('throws when Rabet is not installed', async () => {
      delete window.rabet;
      await expect(
        provider.signTransaction('rawXDR', { networkPassphrase: TESTNET_PASSPHRASE }),
      ).rejects.toThrow(/Rabet is not installed/);
    });
  });

  describe('getName()', () => {
    it('returns "Rabet"', () => {
      expect(provider.getName()).toBe('Rabet');
    });
  });

  describe('disconnect()', () => {
    it('resolves to true (stateless extension)', async () => {
      expect(await provider.disconnect()).toBe(true);
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LedgerProvider } from './LedgerProvider.js';

vi.mock('@ledgerhq/hw-transport-webusb', () => ({
  default: {
    create: vi.fn(),
  },
}));

vi.mock('@ledgerhq/hw-app-stellar', () => ({
  default: vi.fn(),
}));

vi.mock('@stellar/stellar-sdk', () => ({
  Transaction: vi.fn(),
  Networks: { PUBLIC: 'Public Global Stellar Network ; September 2015' },
  Keypair: {
    fromPublicKey: vi.fn(),
  },
  xdr: {
    DecoratedSignature: vi.fn(),
  },
}));

describe('LedgerProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new LedgerProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('getName', () => {
    it('returns Ledger', () => {
      expect(provider.getName()).toBe('Ledger');
    });
  });

  describe('isAvailable', () => {
    it('returns true when navigator.usb is present', async () => {
      vi.stubGlobal('navigator', { usb: {} });
      expect(await provider.isAvailable()).toBe(true);
    });

    it('returns false when navigator.usb is absent', async () => {
      vi.stubGlobal('navigator', {});
      expect(await provider.isAvailable()).toBe(false);
    });
  });

  describe('isConnected', () => {
    it('returns false initially', async () => {
      expect(await provider.isConnected()).toBe(false);
    });

    it('returns true after successful connect', async () => {
      const { default: TransportWebUSB } = await import('@ledgerhq/hw-transport-webusb');
      const { default: Stellar } = await import('@ledgerhq/hw-app-stellar');

      const mockTransport = { close: vi.fn() };
      TransportWebUSB.create.mockResolvedValue(mockTransport);
      Stellar.mockImplementation(() => ({
        getPublicKey: vi.fn().mockResolvedValue({ publicKey: 'GLEDGER123' }),
      }));

      vi.stubGlobal('navigator', { usb: {} });
      await provider.connect();
      expect(await provider.isConnected()).toBe(true);
    });
  });

  describe('connect', () => {
    it('throws when WebUSB is not available', async () => {
      vi.stubGlobal('navigator', {});
      await expect(provider.connect()).rejects.toThrow('WebUSB is not supported');
    });

    it('returns the public key from the Ledger device', async () => {
      const { default: TransportWebUSB } = await import('@ledgerhq/hw-transport-webusb');
      const { default: Stellar } = await import('@ledgerhq/hw-app-stellar');

      const mockTransport = { close: vi.fn() };
      TransportWebUSB.create.mockResolvedValue(mockTransport);
      Stellar.mockImplementation(() => ({
        getPublicKey: vi.fn().mockResolvedValue({ publicKey: 'GLEDGER123' }),
      }));

      vi.stubGlobal('navigator', { usb: {} });
      const address = await provider.connect();
      expect(address).toBe('GLEDGER123');
    });

    it('throws when Ledger returns no public key', async () => {
      const { default: TransportWebUSB } = await import('@ledgerhq/hw-transport-webusb');
      const { default: Stellar } = await import('@ledgerhq/hw-app-stellar');

      TransportWebUSB.create.mockResolvedValue({ close: vi.fn() });
      Stellar.mockImplementation(() => ({
        getPublicKey: vi.fn().mockResolvedValue({}),
      }));

      vi.stubGlobal('navigator', { usb: {} });
      await expect(provider.connect()).rejects.toThrow('Ledger did not return a public key');
    });
  });

  describe('disconnect', () => {
    it('closes the transport and clears state', async () => {
      const { default: TransportWebUSB } = await import('@ledgerhq/hw-transport-webusb');
      const { default: Stellar } = await import('@ledgerhq/hw-app-stellar');

      const mockClose = vi.fn().mockResolvedValue(undefined);
      TransportWebUSB.create.mockResolvedValue({ close: mockClose });
      Stellar.mockImplementation(() => ({
        getPublicKey: vi.fn().mockResolvedValue({ publicKey: 'GLEDGER123' }),
      }));

      vi.stubGlobal('navigator', { usb: {} });
      await provider.connect();
      await provider.disconnect();

      expect(mockClose).toHaveBeenCalledOnce();
      expect(await provider.isConnected()).toBe(false);
    });

    it('returns true without error when not connected', async () => {
      expect(await provider.disconnect()).toBe(true);
    });
  });

  describe('getAddress', () => {
    it('throws when not connected', async () => {
      await expect(provider.getAddress()).rejects.toThrow('Ledger not connected');
    });

    it('returns the cached address after connect', async () => {
      const { default: TransportWebUSB } = await import('@ledgerhq/hw-transport-webusb');
      const { default: Stellar } = await import('@ledgerhq/hw-app-stellar');

      TransportWebUSB.create.mockResolvedValue({ close: vi.fn() });
      Stellar.mockImplementation(() => ({
        getPublicKey: vi.fn().mockResolvedValue({ publicKey: 'GLEDGER999' }),
      }));

      vi.stubGlobal('navigator', { usb: {} });
      await provider.connect();
      expect(await provider.getAddress()).toBe('GLEDGER999');
    });
  });

  describe('signTransaction', () => {
    it('throws when not connected', async () => {
      await expect(provider.signTransaction('XDR')).rejects.toThrow('Ledger not connected');
    });
  });
});

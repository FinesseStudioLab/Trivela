import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FreighterProvider } from './FreighterProvider.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeFreighterApi(overrides = {}) {
  return {
    isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
    getAddress: vi.fn().mockResolvedValue({ address: 'GABC1234FREIGHTER', error: null }),
    requestAccess: vi.fn().mockResolvedValue({ address: 'GABC1234FREIGHTER', error: null }),
    signTransaction: vi
      .fn()
      .mockResolvedValue({ signedTxXdr: 'signed-xdr-freighter', error: null }),
    ...overrides,
  };
}

// ── isAvailable ───────────────────────────────────────────────────────────────

describe('FreighterProvider.isAvailable', () => {
  it('returns false when window.freighterApi is absent', async () => {
    delete globalThis.window?.freighterApi;
    const provider = new FreighterProvider();
    expect(await provider.isAvailable()).toBe(false);
  });

  it('returns true when window.freighterApi is present', async () => {
    globalThis.window = globalThis.window ?? {};
    globalThis.window.freighterApi = makeFreighterApi();
    const provider = new FreighterProvider();
    expect(await provider.isAvailable()).toBe(true);
    delete globalThis.window.freighterApi;
  });
});

// ── isConnected ───────────────────────────────────────────────────────────────

describe('FreighterProvider.isConnected', () => {
  beforeEach(() => {
    globalThis.window = globalThis.window ?? {};
  });

  it('returns true when freighterApi reports connected', async () => {
    globalThis.window.freighterApi = makeFreighterApi({
      isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
    });
    const provider = new FreighterProvider();
    expect(await provider.isConnected()).toBe(true);
    delete globalThis.window.freighterApi;
  });

  it('returns false when freighterApi reports not connected', async () => {
    globalThis.window.freighterApi = makeFreighterApi({
      isConnected: vi.fn().mockResolvedValue({ isConnected: false }),
    });
    const provider = new FreighterProvider();
    expect(await provider.isConnected()).toBe(false);
    delete globalThis.window.freighterApi;
  });

  it('returns false when freighterApi is absent', async () => {
    delete globalThis.window.freighterApi;
    const provider = new FreighterProvider();
    expect(await provider.isConnected()).toBe(false);
  });
});

// ── connect ───────────────────────────────────────────────────────────────────

describe('FreighterProvider.connect', () => {
  beforeEach(() => {
    globalThis.window = globalThis.window ?? {};
  });

  it('returns the address when already connected', async () => {
    globalThis.window.freighterApi = makeFreighterApi({
      isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
      getAddress: vi.fn().mockResolvedValue({ address: 'GABC_CONNECTED', error: null }),
    });
    const provider = new FreighterProvider();
    const address = await provider.connect();
    expect(address).toBe('GABC_CONNECTED');
    delete globalThis.window.freighterApi;
  });

  it('throws a clear error when wallet is not installed', async () => {
    delete globalThis.window.freighterApi;
    const provider = new FreighterProvider();
    await expect(provider.connect()).rejects.toThrow(/Freighter API is unavailable/i);
  });

  it('throws when isConnected returns an error', async () => {
    globalThis.window.freighterApi = makeFreighterApi({
      isConnected: vi.fn().mockResolvedValue({ error: 'extension locked' }),
    });
    const provider = new FreighterProvider();
    await expect(provider.connect()).rejects.toThrow('extension locked');
    delete globalThis.window.freighterApi;
  });
});

// ── getAddress ────────────────────────────────────────────────────────────────

describe('FreighterProvider.getAddress', () => {
  beforeEach(() => {
    globalThis.window = globalThis.window ?? {};
  });

  it('returns the public key', async () => {
    globalThis.window.freighterApi = makeFreighterApi({
      getAddress: vi.fn().mockResolvedValue({ address: 'GPUBLICKEY1', error: null }),
    });
    const provider = new FreighterProvider();
    expect(await provider.getAddress()).toBe('GPUBLICKEY1');
    delete globalThis.window.freighterApi;
  });

  it('throws when getAddress returns an error', async () => {
    globalThis.window.freighterApi = makeFreighterApi({
      getAddress: vi.fn().mockResolvedValue({ address: null, error: 'not allowed' }),
    });
    const provider = new FreighterProvider();
    await expect(provider.getAddress()).rejects.toThrow('not allowed');
    delete globalThis.window.freighterApi;
  });

  it('throws when api is absent', async () => {
    delete globalThis.window.freighterApi;
    const provider = new FreighterProvider();
    await expect(provider.getAddress()).rejects.toThrow(/Freighter API is unavailable/i);
  });
});

// ── signTransaction ───────────────────────────────────────────────────────────

describe('FreighterProvider.signTransaction', () => {
  beforeEach(() => {
    globalThis.window = globalThis.window ?? {};
  });

  it('returns signed XDR', async () => {
    const api = makeFreighterApi();
    globalThis.window.freighterApi = api;
    const provider = new FreighterProvider();
    const result = await provider.signTransaction('raw-xdr', {
      networkPassphrase: 'Test SDF Network',
    });
    expect(result).toBe('signed-xdr-freighter');
    expect(api.signTransaction).toHaveBeenCalledWith('raw-xdr', expect.any(Object));
    delete globalThis.window.freighterApi;
  });

  it('throws when signTransaction returns an error', async () => {
    globalThis.window.freighterApi = makeFreighterApi({
      signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: null, error: 'user rejected' }),
    });
    const provider = new FreighterProvider();
    await expect(provider.signTransaction('raw-xdr', {})).rejects.toThrow('user rejected');
    delete globalThis.window.freighterApi;
  });

  it('throws when api is absent', async () => {
    delete globalThis.window.freighterApi;
    const provider = new FreighterProvider();
    await expect(provider.signTransaction('raw-xdr', {})).rejects.toThrow(
      /Freighter API is unavailable/i,
    );
  });
});

// ── disconnect ────────────────────────────────────────────────────────────────

describe('FreighterProvider.disconnect', () => {
  it('returns true (Freighter has no programmatic disconnect)', async () => {
    const provider = new FreighterProvider();
    expect(await provider.disconnect()).toBe(true);
  });
});

// ── getName ───────────────────────────────────────────────────────────────────

describe('FreighterProvider.getName', () => {
  it('returns "Freighter"', () => {
    expect(new FreighterProvider().getName()).toBe('Freighter');
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LobstrProvider } from './LobstrProvider.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeLobstrApi(overrides = {}) {
  return {
    connect: vi.fn().mockResolvedValue({ publicKey: 'GLOBSTR_PK_1234' }),
    getPublicKey: vi.fn().mockResolvedValue('GLOBSTR_PK_1234'),
    signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: 'signed-xdr-lobstr' }),
    ...overrides,
  };
}

function setLobstr(api) {
  globalThis.window = globalThis.window ?? {};
  globalThis.window.lobstr = api;
  delete globalThis.window.lobstrApi;
}

function clearLobstr() {
  if (globalThis.window) {
    delete globalThis.window.lobstr;
    delete globalThis.window.lobstrApi;
  }
}

// ── isAvailable ───────────────────────────────────────────────────────────────

describe('LobstrProvider.isAvailable', () => {
  it('returns false when neither window.lobstr nor window.lobstrApi is present', async () => {
    clearLobstr();
    const provider = new LobstrProvider();
    expect(await provider.isAvailable()).toBe(false);
  });

  it('returns true when window.lobstr is set', async () => {
    setLobstr(makeLobstrApi());
    const provider = new LobstrProvider();
    expect(await provider.isAvailable()).toBe(true);
    clearLobstr();
  });

  it('returns true when window.lobstrApi is set', async () => {
    globalThis.window = globalThis.window ?? {};
    globalThis.window.lobstrApi = makeLobstrApi();
    const provider = new LobstrProvider();
    expect(await provider.isAvailable()).toBe(true);
    delete globalThis.window.lobstrApi;
  });
});

// ── connect ───────────────────────────────────────────────────────────────────

describe('LobstrProvider.connect', () => {
  beforeEach(clearLobstr);

  it('connects via api.connect() and returns publicKey', async () => {
    setLobstr(
      makeLobstrApi({
        connect: vi.fn().mockResolvedValue({ publicKey: 'GCONNECTED' }),
      }),
    );
    const provider = new LobstrProvider();
    const address = await provider.connect();
    expect(address).toBe('GCONNECTED');
    clearLobstr();
  });

  it('falls back to getPublicKey() when connect is absent', async () => {
    setLobstr({
      getPublicKey: vi.fn().mockResolvedValue('GFALLBACK'),
    });
    const provider = new LobstrProvider();
    const address = await provider.connect();
    expect(address).toBe('GFALLBACK');
    clearLobstr();
  });

  it('throws a clear error when wallet is not installed', async () => {
    clearLobstr();
    const provider = new LobstrProvider();
    await expect(provider.connect()).rejects.toThrow(/Lobstr is unavailable/i);
  });

  it('throws when connect returns no address', async () => {
    setLobstr(
      makeLobstrApi({
        connect: vi.fn().mockResolvedValue({}),
      }),
    );
    const provider = new LobstrProvider();
    await expect(provider.connect()).rejects.toThrow(/did not return a wallet address/i);
    clearLobstr();
  });

  it('throws a compat error when neither connect nor getPublicKey exists', async () => {
    setLobstr({ someOtherMethod: vi.fn() });
    const provider = new LobstrProvider();
    await expect(provider.connect()).rejects.toThrow(/not compatible/i);
    clearLobstr();
  });
});

// ── getAddress ────────────────────────────────────────────────────────────────

describe('LobstrProvider.getAddress', () => {
  it('returns public key via getPublicKey()', async () => {
    setLobstr(makeLobstrApi());
    const provider = new LobstrProvider();
    expect(await provider.getAddress()).toBe('GLOBSTR_PK_1234');
    clearLobstr();
  });

  it('throws when getPublicKey returns empty', async () => {
    setLobstr(makeLobstrApi({ getPublicKey: vi.fn().mockResolvedValue(null) }));
    const provider = new LobstrProvider();
    await expect(provider.getAddress()).rejects.toThrow(/No address available/i);
    clearLobstr();
  });

  it('throws when wallet is absent', async () => {
    clearLobstr();
    const provider = new LobstrProvider();
    await expect(provider.getAddress()).rejects.toThrow(/Lobstr is unavailable/i);
  });
});

// ── signTransaction ───────────────────────────────────────────────────────────

describe('LobstrProvider.signTransaction', () => {
  it('returns signed XDR via signTransaction()', async () => {
    const api = makeLobstrApi();
    setLobstr(api);
    const provider = new LobstrProvider();
    const result = await provider.signTransaction('raw-xdr', { networkPassphrase: 'Test SDF' });
    expect(result).toBe('signed-xdr-lobstr');
    expect(api.signTransaction).toHaveBeenCalledWith('raw-xdr', expect.any(Object));
    clearLobstr();
  });

  it('falls back to sign() when signTransaction is absent', async () => {
    setLobstr({
      sign: vi.fn().mockResolvedValue({ xdr: 'fallback-signed-xdr' }),
    });
    const provider = new LobstrProvider();
    const result = await provider.signTransaction('raw-xdr', {});
    expect(result).toBe('fallback-signed-xdr');
    clearLobstr();
  });

  it('throws when signed result is empty', async () => {
    setLobstr(
      makeLobstrApi({
        signTransaction: vi.fn().mockResolvedValue({}),
      }),
    );
    const provider = new LobstrProvider();
    await expect(provider.signTransaction('raw-xdr', {})).rejects.toThrow(
      /did not return a signed transaction/i,
    );
    clearLobstr();
  });

  it('throws when wallet is absent', async () => {
    clearLobstr();
    const provider = new LobstrProvider();
    await expect(provider.signTransaction('raw-xdr', {})).rejects.toThrow(/Lobstr is unavailable/i);
  });

  it('throws a compat error when neither signTransaction nor sign exists', async () => {
    setLobstr({ connect: vi.fn() });
    const provider = new LobstrProvider();
    await expect(provider.signTransaction('raw-xdr', {})).rejects.toThrow(
      /does not support transaction signing/i,
    );
    clearLobstr();
  });
});

// ── isConnected ───────────────────────────────────────────────────────────────

describe('LobstrProvider.isConnected', () => {
  it('returns true when lobstr is present', async () => {
    setLobstr(makeLobstrApi());
    const provider = new LobstrProvider();
    expect(await provider.isConnected()).toBe(true);
    clearLobstr();
  });

  it('returns false when lobstr is absent', async () => {
    clearLobstr();
    const provider = new LobstrProvider();
    expect(await provider.isConnected()).toBe(false);
  });
});

// ── disconnect ────────────────────────────────────────────────────────────────

describe('LobstrProvider.disconnect', () => {
  it('returns true', async () => {
    const provider = new LobstrProvider();
    expect(await provider.disconnect()).toBe(true);
  });
});

// ── getName ───────────────────────────────────────────────────────────────────

describe('LobstrProvider.getName', () => {
  it('returns "Lobstr"', () => {
    expect(new LobstrProvider().getName()).toBe('Lobstr');
  });
});

// ── network-detect smoke ──────────────────────────────────────────────────────

describe('LobstrProvider network detection', () => {
  it('passes networkPassphrase through to signTransaction', async () => {
    const api = makeLobstrApi();
    setLobstr(api);
    const provider = new LobstrProvider();
    await provider.signTransaction('xdr', {
      networkPassphrase: 'Test SDF Network ; December 2021',
    });
    expect(api.signTransaction).toHaveBeenCalledWith(
      'xdr',
      expect.objectContaining({ networkPassphrase: 'Test SDF Network ; December 2021' }),
    );
    clearLobstr();
  });
});

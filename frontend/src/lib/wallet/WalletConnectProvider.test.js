import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WalletConnectProvider } from './WalletConnectProvider.js';

const STELLAR_ADDRESS = 'GDXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEF';

function makeSession(address = STELLAR_ADDRESS) {
  return {
    topic: 'test-topic-abc',
    namespaces: {
      stellar: {
        accounts: [`stellar:pubnet:${address}`],
      },
    },
  };
}

function makeClient(sessions = [makeSession()]) {
  return {
    connect: vi.fn().mockResolvedValue({
      uri: 'wc:abc@2?relay-protocol=irn',
      approval: vi.fn().mockResolvedValue(sessions[0] ?? makeSession()),
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    request: vi.fn().mockResolvedValue({ signedTxXdr: 'signed-xdr-blob' }),
    session: {
      getAll: vi.fn().mockReturnValue(sessions),
    },
  };
}

describe('WalletConnectProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new WalletConnectProvider();
    delete window.__walletConnectClient;
  });

  afterEach(() => {
    delete window.__walletConnectClient;
  });

  // ── getName ────────────────────────────────────────────────────────────────

  it('getName returns "WalletConnect"', () => {
    expect(provider.getName()).toBe('WalletConnect');
  });

  // ── isAvailable ────────────────────────────────────────────────────────────

  it('isAvailable returns false when client is absent', async () => {
    expect(await provider.isAvailable()).toBe(false);
  });

  it('isAvailable returns true when client is injected', async () => {
    window.__walletConnectClient = makeClient();
    expect(await provider.isAvailable()).toBe(true);
  });

  // ── isConnected ────────────────────────────────────────────────────────────

  it('isConnected returns false when no client', async () => {
    expect(await provider.isConnected()).toBe(false);
  });

  it('isConnected returns false when client has no sessions', async () => {
    window.__walletConnectClient = makeClient([]);
    expect(await provider.isConnected()).toBe(false);
  });

  it('isConnected returns true with an active session', async () => {
    window.__walletConnectClient = makeClient([makeSession()]);
    expect(await provider.isConnected()).toBe(true);
  });

  // ── connect ────────────────────────────────────────────────────────────────

  it('connect throws a clear message when WalletConnect is not configured', async () => {
    await expect(provider.connect()).rejects.toThrow('WalletConnect is not configured');
  });

  it('connect returns the Stellar address from the approved session', async () => {
    const client = makeClient([makeSession(STELLAR_ADDRESS)]);
    window.__walletConnectClient = client;

    const address = await provider.connect();

    expect(address).toBe(STELLAR_ADDRESS);
    expect(client.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredNamespaces: expect.objectContaining({ stellar: expect.any(Object) }),
      }),
    );
  });

  it('connect throws when the session returns no Stellar address', async () => {
    const emptySession = { namespaces: { stellar: { accounts: [] } } };
    const client = {
      ...makeClient(),
      connect: vi.fn().mockResolvedValue({
        uri: 'wc:abc',
        approval: vi.fn().mockResolvedValue(emptySession),
      }),
    };
    window.__walletConnectClient = client;

    await expect(provider.connect()).rejects.toThrow(
      'WalletConnect session did not provide a Stellar address',
    );
  });

  // ── disconnect ─────────────────────────────────────────────────────────────

  it('disconnect returns true gracefully when no client is present', async () => {
    expect(await provider.disconnect()).toBe(true);
  });

  it('disconnect calls client.disconnect for every active session', async () => {
    const session = makeSession();
    const client = makeClient([session]);
    window.__walletConnectClient = client;

    await provider.disconnect();

    expect(client.disconnect).toHaveBeenCalledWith({
      topic: session.topic,
      reason: { code: 6000, message: 'User disconnected' },
    });
  });

  it('disconnect clears the cached address', async () => {
    const client = makeClient([makeSession(STELLAR_ADDRESS)]);
    window.__walletConnectClient = client;
    await provider.connect();

    await provider.disconnect();

    await expect(provider.getAddress()).rejects.toThrow('No WalletConnect session active');
  });

  // ── getAddress ─────────────────────────────────────────────────────────────

  it('getAddress throws when not connected', async () => {
    await expect(provider.getAddress()).rejects.toThrow('No WalletConnect session active');
  });

  it('getAddress returns the cached address after connect', async () => {
    window.__walletConnectClient = makeClient([makeSession(STELLAR_ADDRESS)]);
    await provider.connect();

    expect(await provider.getAddress()).toBe(STELLAR_ADDRESS);
  });

  // ── signTransaction ────────────────────────────────────────────────────────

  it('signTransaction throws when WalletConnect is not configured', async () => {
    await expect(provider.signTransaction('xdr-blob', {})).rejects.toThrow(
      'WalletConnect is not configured',
    );
  });

  it('signTransaction throws when there is no active session', async () => {
    window.__walletConnectClient = makeClient([]);

    await expect(provider.signTransaction('xdr-blob', {})).rejects.toThrow(
      'No active WalletConnect session',
    );
  });

  it('signTransaction uses stellar:testnet chain for testnet passphrase', async () => {
    const client = makeClient([makeSession()]);
    window.__walletConnectClient = client;

    await provider.signTransaction('xdr-blob', {
      networkPassphrase: 'Test SDF Network ; September 2015',
    });

    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 'stellar:testnet' }),
    );
  });

  it('signTransaction uses stellar:pubnet chain for mainnet passphrase', async () => {
    const client = makeClient([makeSession()]);
    window.__walletConnectClient = client;

    await provider.signTransaction('xdr-blob', {
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
    });

    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 'stellar:pubnet' }),
    );
  });

  it('signTransaction returns the signed XDR from the wallet', async () => {
    const client = makeClient([makeSession()]);
    window.__walletConnectClient = client;

    const signed = await provider.signTransaction('raw-xdr', {});

    expect(signed).toBe('signed-xdr-blob');
  });

  it('signTransaction throws when the wallet returns no XDR', async () => {
    const client = makeClient([makeSession()]);
    client.request = vi.fn().mockResolvedValue(null);
    window.__walletConnectClient = client;

    await expect(provider.signTransaction('raw-xdr', {})).rejects.toThrow(
      'WalletConnect did not return a signed transaction',
    );
  });

  it('signTransaction accepts the xdr field as fallback response shape', async () => {
    const client = makeClient([makeSession()]);
    client.request = vi.fn().mockResolvedValue({ xdr: 'fallback-signed-xdr' });
    window.__walletConnectClient = client;

    const signed = await provider.signTransaction('raw-xdr', {});

    expect(signed).toBe('fallback-signed-xdr');
  });
});

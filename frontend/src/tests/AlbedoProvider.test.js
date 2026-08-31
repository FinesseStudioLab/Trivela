import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AlbedoProvider } from '../lib/wallet/AlbedoProvider.js';

function makeAlbedoApi(overrides = {}) {
  return {
    publicKey: vi
      .fn()
      .mockResolvedValue({ pubkey: 'GTEST000000000000000000000000000000000000000000000000000' }),
    signTransaction: vi.fn().mockResolvedValue({ signed_envelope_xdr: 'signed-xdr' }),
    ...overrides,
  };
}

describe('AlbedoProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new AlbedoProvider();
    delete window.albedo;
  });

  it('getName() returns "Albedo"', () => {
    expect(provider.getName()).toBe('Albedo');
  });

  it('isAvailable() returns false when window.albedo is absent', async () => {
    expect(await provider.isAvailable()).toBe(false);
  });

  it('isAvailable() returns true when window.albedo is present', async () => {
    window.albedo = makeAlbedoApi();
    expect(await provider.isAvailable()).toBe(true);
  });

  it('connect() returns the public key from albedo.publicKey()', async () => {
    window.albedo = makeAlbedoApi();
    const address = await provider.connect();
    expect(address).toBe('GTEST000000000000000000000000000000000000000000000000000');
  });

  it('connect() throws gracefully when albedo is absent', async () => {
    await expect(provider.connect()).rejects.toThrow(/Albedo is not available/);
  });

  it('connect() propagates user rejection', async () => {
    window.albedo = makeAlbedoApi({
      publicKey: vi.fn().mockRejectedValue({ message: 'User rejected', code: 'user_rejected' }),
    });
    await expect(provider.connect()).rejects.toThrow(/rejected by the user/);
  });

  it('signTransaction() returns signed_envelope_xdr', async () => {
    window.albedo = makeAlbedoApi();
    await provider.connect();
    const result = await provider.signTransaction('unsigned-xdr', {
      networkPassphrase: 'Test SDF Network ; September 2015',
    });
    expect(result).toBe('signed-xdr');
  });

  it('disconnect() clears the connected pubkey', async () => {
    window.albedo = makeAlbedoApi();
    await provider.connect();
    expect(await provider.isConnected()).toBe(true);
    await provider.disconnect();
    expect(await provider.isConnected()).toBe(false);
  });
});

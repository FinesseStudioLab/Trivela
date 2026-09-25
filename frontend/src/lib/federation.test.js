import { describe, it, expect, vi, afterEach } from 'vitest';
import { Federation } from '@stellar/stellar-sdk';
import { isFederatedAddress, resolveFederatedAddress } from './federation';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isFederatedAddress', () => {
  it('accepts a name*domain address', () => {
    expect(isFederatedAddress('alice*trivela.network')).toBe(true);
  });

  it('rejects a raw G... account ID', () => {
    expect(isFederatedAddress('GABC1234DEFG5678HIJK9012LMNO3456PQRS7890TUVW1234XYZ56789ABC')).toBe(
      false,
    );
  });

  it('rejects a domain-less value with an asterisk', () => {
    expect(isFederatedAddress('alice*notadomain')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isFederatedAddress(undefined)).toBe(false);
    expect(isFederatedAddress(null)).toBe(false);
  });
});

describe('resolveFederatedAddress', () => {
  it('returns non-federated values unchanged without calling the federation server', async () => {
    const spy = vi.spyOn(Federation.Server, 'resolve');
    const accountId = 'GABC1234DEFG5678HIJK9012LMNO3456PQRS7890TUVW1234XYZ56789ABC';

    await expect(resolveFederatedAddress(accountId)).resolves.toBe(accountId);
    expect(spy).not.toHaveBeenCalled();
  });

  it('resolves a federated address to its account_id', async () => {
    const resolved = 'GB5XVAABEQMY63WTHDQ5RXADGYF345VWMNPTN2GFUDZT57D57ZQTJ7PS';
    vi.spyOn(Federation.Server, 'resolve').mockResolvedValue({
      account_id: resolved,
      memo_type: undefined,
      memo: undefined,
    });

    await expect(resolveFederatedAddress('alice*trivela.network')).resolves.toBe(resolved);
    expect(Federation.Server.resolve).toHaveBeenCalledWith(
      'alice*trivela.network',
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it('wraps federation server failures in a descriptive error', async () => {
    vi.spyOn(Federation.Server, 'resolve').mockRejectedValue(new Error('name not found'));

    await expect(resolveFederatedAddress('ghost*trivela.network')).rejects.toThrow(
      /Could not resolve "ghost\*trivela\.network".*name not found/,
    );
  });
});

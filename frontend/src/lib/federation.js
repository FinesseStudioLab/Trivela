/**
 * SEP-0002 federated Stellar address resolution (#1225).
 *
 * `@stellar/stellar-sdk` already ships a full federation client
 * (`Federation.Server.resolve`) that fetches the domain's stellar.toml,
 * finds `FEDERATION_SERVER`, and queries it for the `name*domain` address —
 * so this is a thin wrapper, not a protocol reimplementation.
 */

import { Federation } from '@stellar/stellar-sdk';

/** A `name*domain` federated Stellar address, e.g. `alice*trivela.network`. */
export function isFederatedAddress(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split('*');
  return parts.length === 2 && parts[0].length > 0 && parts[1].includes('.');
}

/**
 * Resolves a federated address (`name*domain`) to its Stellar account ID.
 * Values that aren't federated addresses (e.g. already a G... account ID)
 * are returned unchanged, so callers can pass either through unconditionally.
 *
 * @param {string} value
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<string>} the resolved account ID, or `value` unchanged
 * @throws {Error} if `value` looks like a federated address but resolution
 *   fails (no stellar.toml, no FEDERATION_SERVER, name not found, etc.)
 */
export async function resolveFederatedAddress(value, opts = {}) {
  if (!isFederatedAddress(value)) return value;

  try {
    const record = await Federation.Server.resolve(value, { timeout: opts.timeout ?? 5000 });
    return record.account_id;
  } catch (err) {
    throw new Error(`Could not resolve "${value}": ${err?.message ?? 'unknown federation error'}`);
  }
}

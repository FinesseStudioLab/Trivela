// @ts-check

import { StrKey } from '@stellar/stellar-sdk';

export const MAX_ALLOWLIST_ROWS = 10_000;

/**
 * Parse a CSV-like file with one G-address per row (optionally includes columns).
 *
 * Accepted formats per row:
 * - address
 * - address,label
 * - address,bonus_points
 * - address,label,bonus_points
 *
 * For simplicity we split by comma and treat first column as address.
 * Also supports newline-delimited (no commas).
 *
 * @param {string} text
 * @returns {{ rows: {row:number,address:string,label?:string,bonus_points?:string}[] }}
 */
export function parseAllowlistCsv(text) {
  const lines = String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const rows = lines.slice(0, MAX_ALLOWLIST_ROWS).map((line, idx) => {
    const cols = line.split(',').map((c) => c.trim());
    const address = cols[0];
    const label = cols[1] && !isNaN(Number(cols[1])) ? undefined : cols[1];
    const bonus_points = cols.length >= 2 && isNaN(Number(cols[1])) ? cols[2] : cols[1];

    return {
      row: idx + 1,
      address,
      label: label && label.length ? label : undefined,
      bonus_points: bonus_points && bonus_points.length ? bonus_points : undefined,
    };
  });

  return { rows };
}

/** @param {string} address */
export function validateGAddress(address) {
  if (!address || typeof address !== 'string') return false;
  return StrKey.isValidEd25519PublicKey(address);
}

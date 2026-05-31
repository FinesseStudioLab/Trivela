/**
 * Merkle allowlist helpers (browser) — companion to
 * scripts/generate-merkle.mjs (#294).
 *
 * Identical leaf + hash conventions as the CLI: leaves are
 * `sha256(scvAddress_xdr_bytes)`, internal nodes are sorted-pair
 * sha256 — both mirroring `hash_pair` in the campaign contract. The
 * browser build uses the WebCrypto SubtleCrypto API which is async,
 * so every public function returns a Promise.
 */

import { StrKey, xdr } from '@stellar/stellar-sdk';

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function compareBytes(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

async function sha256(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(buf);
}

export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('hex string must be even length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function addressToLeaf(gAddress) {
  if (!StrKey.isValidEd25519PublicKey(gAddress)) {
    throw new Error(`not a Stellar G-address: ${gAddress}`);
  }
  const raw = StrKey.decodeEd25519PublicKey(gAddress);
  const scAddress = xdr.ScAddress.scAddressTypeAccount(
    xdr.PublicKey.publicKeyTypeEd25519(raw),
  );
  const scVal = xdr.ScVal.scvAddress(scAddress);
  const xdrBytes = scVal.toXDR();
  // toXDR returns a Buffer in Node, Uint8Array in the browser; both
  // are Uint8Array-shaped for SubtleCrypto.
  return sha256(xdrBytes);
}

export async function hashPair(a, b) {
  const [left, right] = compareBytes(a, b) <= 0 ? [a, b] : [b, a];
  const combined = new Uint8Array(64);
  combined.set(left, 0);
  combined.set(right, 32);
  return sha256(combined);
}

/** Build the full Merkle tree. Returns layered arrays of Uint8Array. */
export async function buildTree(leaves) {
  if (leaves.length === 0) throw new Error('cannot build a Merkle tree from zero leaves');
  const sorted = [...leaves].sort(compareBytes);
  const dedup = [];
  for (const leaf of sorted) {
    if (dedup.length === 0 || !bytesEqual(dedup[dedup.length - 1], leaf)) {
      dedup.push(leaf);
    }
  }
  const layers = [dedup];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      if (i + 1 < prev.length) {
        next.push(await hashPair(prev[i], prev[i + 1]));
      } else {
        next.push(prev[i]);
      }
    }
    layers.push(next);
  }
  return layers;
}

export function proofForLeaf(layers, leaf) {
  const layer0 = layers[0];
  let index = layer0.findIndex((l) => bytesEqual(l, leaf));
  if (index === -1) throw new Error('leaf not in tree');
  const siblings = [];
  for (let l = 0; l < layers.length - 1; l += 1) {
    const layer = layers[l];
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    if (siblingIndex < layer.length) {
      siblings.push(layer[siblingIndex]);
    }
    index = Math.floor(index / 2);
  }
  return siblings;
}

export async function verifyProof(leaf, siblings, root) {
  let computed = leaf;
  for (const sibling of siblings) {
    computed = await hashPair(computed, sibling);
  }
  return bytesEqual(computed, root);
}

/** High-level: addresses[] → { root: hex, proofs: { G…: { leaf, siblings } } } */
export async function generateAllowlist(addresses) {
  const leaves = [];
  for (const addr of addresses) {
    leaves.push(await addressToLeaf(addr));
  }
  const tree = await buildTree(leaves);
  const root = tree[tree.length - 1][0];
  const proofs = {};
  for (let i = 0; i < addresses.length; i += 1) {
    const leaf = leaves[i];
    const siblings = proofForLeaf(tree, leaf);
    proofs[addresses[i]] = {
      leaf: bytesToHex(leaf),
      siblings: siblings.map(bytesToHex),
    };
  }
  return {
    root: bytesToHex(root),
    leafFormat: 'sha256(stellar_address_xdr)',
    proofs,
  };
}

#!/usr/bin/env node
/**
 * Merkle allowlist CLI (#294).
 *
 * Reads a CSV or newline-delimited list of Stellar G-addresses,
 * builds a Merkle tree over `sha256(address_xdr_bytes)` leaves with
 * sorted-pair internal hashing (matching `hash_pair()` in
 * contracts/campaign/src/lib.rs), and emits a JSON document with
 * the tree root and one proof per address.
 *
 * Usage:
 *   node scripts/generate-merkle.mjs --input addresses.csv --output proofs.json
 *   npm run merkle:generate -- --input addresses.csv --output proofs.json
 *
 * Output shape:
 *   {
 *     "root": "<hex32>",
 *     "leafFormat": "sha256(stellar_address_xdr)",
 *     "proofs": {
 *       "GADDR...": { "leaf": "<hex32>", "siblings": ["<hex32>", ...] },
 *       ...
 *     }
 *   }
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { StrKey, xdr } from '@stellar/stellar-sdk';

function parseArgs(argv) {
  const opts = { input: null, output: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' || arg === '-i') opts.input = argv[++i];
    else if (arg === '--output' || arg === '-o') opts.output = argv[++i];
    else if (arg === '--help' || arg === '-h') opts.help = true;
  }
  return opts;
}

/**
 * Decode a Stellar G-address into the 32-byte raw Ed25519 public key,
 * then wrap it in the same XDR shape the contract uses so the leaf
 * hash matches byte-for-byte.
 *
 * Contract convention (per the inline comment in
 * contracts/campaign/src/lib.rs):
 *   leaf = sha256(address_xdr_bytes)
 *
 * The Address type in Soroban serialises as ScAddress { type: Account,
 * accountId: PublicKeyTypeEd25519(<32 bytes>) }. Both the CLI and the
 * frontend must emit identical bytes here or the on-chain
 * verification will reject the proof.
 */
export function addressToLeaf(gAddress) {
  if (!StrKey.isValidEd25519PublicKey(gAddress)) {
    throw new Error(`not a Stellar G-address: ${gAddress}`);
  }
  const raw = StrKey.decodeEd25519PublicKey(gAddress);
  // ScAddress -> ScVal serialisation:
  //   xdr.ScAddress.scAddressTypeAccount(xdr.PublicKey.publicKeyTypeEd25519(raw))
  const scAddress = xdr.ScAddress.scAddressTypeAccount(xdr.PublicKey.publicKeyTypeEd25519(raw));
  const scVal = xdr.ScVal.scvAddress(scAddress);
  const bytes = scVal.toXDR();
  return createHash('sha256').update(bytes).digest();
}

/** Hash two 32-byte buffers in sorted order. Mirrors `hash_pair()`. */
export function hashPair(a, b) {
  const [left, right] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a];
  return createHash('sha256')
    .update(Buffer.concat([left, right]))
    .digest();
}

/**
 * Build a complete Merkle tree from an array of leaf buffers.
 * Returns `[layer0, layer1, ..., rootLayer]`, where layer0 is the
 * sorted-deduplicated leaves and each subsequent layer is half the
 * size (rounded up) of the previous one. Odd nodes are promoted
 * unchanged to the next level.
 *
 * Sorting + dedup matches what every allowlist tool needs: stable
 * input → stable root.
 */
export function buildTree(leaves) {
  if (leaves.length === 0) {
    throw new Error('cannot build a Merkle tree from zero leaves');
  }
  const sorted = [...leaves].sort(Buffer.compare);
  const dedup = [];
  for (const leaf of sorted) {
    if (dedup.length === 0 || !dedup[dedup.length - 1].equals(leaf)) {
      dedup.push(leaf);
    }
  }
  const layers = [dedup];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      if (i + 1 < prev.length) {
        next.push(hashPair(prev[i], prev[i + 1]));
      } else {
        // Promote the odd-one-out so it's hashed at a higher layer.
        // Sorted-pair hashing tolerates this gracefully.
        next.push(prev[i]);
      }
    }
    layers.push(next);
  }
  return layers;
}

/** Extract the sibling-hash proof for a specific leaf from the tree. */
export function proofForLeaf(layers, leaf) {
  const layer0 = layers[0];
  let index = layer0.findIndex((l) => l.equals(leaf));
  if (index === -1) {
    throw new Error('leaf not in tree');
  }
  const siblings = [];
  for (let l = 0; l < layers.length - 1; l += 1) {
    const layer = layers[l];
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    if (siblingIndex < layer.length) {
      siblings.push(layer[siblingIndex]);
    }
    // Else: this node was promoted (odd-one-out at this level) — no
    // sibling to record. Verification handles this because the
    // promoted node's hash is what propagates to the parent layer.
    index = Math.floor(index / 2);
  }
  return siblings;
}

/**
 * Re-implementation of the contract's verify_merkle_proof, used by
 * both the CLI's self-test and frontend rendering.
 */
export function verifyProof(leaf, siblings, root) {
  let computed = leaf;
  for (const sibling of siblings) {
    computed = hashPair(computed, sibling);
  }
  return Buffer.compare(computed, root) === 0;
}

function toHex(buf) {
  return Buffer.from(buf).toString('hex');
}

/** Parse a CSV-or-newline file into an array of trimmed G-addresses. */
export function parseAddressFile(raw) {
  return raw
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** High-level: addresses → { root, proofs } document. */
export function generateAllowlist(addresses) {
  const leaves = addresses.map(addressToLeaf);
  const tree = buildTree(leaves);
  const root = tree[tree.length - 1][0];
  const proofs = {};
  for (let i = 0; i < addresses.length; i += 1) {
    const leaf = leaves[i];
    const siblings = proofForLeaf(tree, leaf);
    proofs[addresses[i]] = {
      leaf: toHex(leaf),
      siblings: siblings.map(toHex),
    };
  }
  return {
    root: toHex(root),
    leafFormat: 'sha256(stellar_address_xdr)',
    proofs,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.input || !opts.output) {
    process.stdout.write(`Usage: generate-merkle.mjs --input <file> --output <file>\n`);
    process.exit(opts.help ? 0 : 1);
  }
  const raw = readFileSync(resolve(opts.input), 'utf8');
  const addresses = parseAddressFile(raw);
  if (addresses.length === 0) {
    process.stderr.write('input file has no addresses\n');
    process.exit(2);
  }
  const doc = generateAllowlist(addresses);
  // Sanity self-test: every emitted proof must verify against the
  // emitted root. Catches off-by-one bugs in proofForLeaf before the
  // file is published.
  const rootBuf = Buffer.from(doc.root, 'hex');
  for (const [addr, entry] of Object.entries(doc.proofs)) {
    const leaf = Buffer.from(entry.leaf, 'hex');
    const siblings = entry.siblings.map((s) => Buffer.from(s, 'hex'));
    if (!verifyProof(leaf, siblings, rootBuf)) {
      throw new Error(`self-test failed: proof for ${addr} does not validate`);
    }
  }
  writeFileSync(resolve(opts.output), JSON.stringify(doc, null, 2));
  process.stdout.write(
    `wrote ${Object.keys(doc.proofs).length} proofs (root=${doc.root.slice(0, 12)}...) → ${opts.output}\n`,
  );
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  });
}

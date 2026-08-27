#!/usr/bin/env node
// Reference co-admin multisig signer (issue #839).
//
// Produces the exact 64-byte ed25519 signature the rewards contract's
// `verify_multisig` expects for a privileged multisig op — see
// `multisig_message()` in `contracts/rewards/src/lib.rs`:
//
//   message = op (u32, big-endian, 4 bytes)
//           | nonce (u64, big-endian, 8 bytes)
//           | args_hash (32 raw bytes)
//
// signature = ed25519_sign(co_admin_private_key, message)   // 64 bytes
//
// `args_hash` is whatever 32-byte digest the calling entrypoint hashes its
// arguments into (e.g. sha256 of the encoded call args) — this script only
// handles the signing step once you already have that hash; it does not
// know how to compute it for a given contract call.
//
// Usage:
//   node scripts/multisig-sign.mjs <private-key-hex-32-bytes> <op-u32> <nonce-u64> <args-hash-hex-32-bytes>
//
// Uses Node's built-in `node:crypto` Ed25519 support (Node >= 12, raw keys
// require Node >= 18) — no external dependencies.

import { createPrivateKey, sign } from 'node:crypto';

function usageAndExit(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(
    'Usage: node scripts/multisig-sign.mjs <private-key-hex-32B> <op-u32> <nonce-u64> <args-hash-hex-32B>',
  );
  process.exit(1);
}

function hexToBuffer(hex, expectedBytes, label) {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length !== expectedBytes * 2 || !/^[0-9a-fA-F]+$/.test(clean)) {
    usageAndExit(`${label} must be exactly ${expectedBytes} bytes of hex`);
  }
  return Buffer.from(clean, 'hex');
}

/// DER-wraps a raw 32-byte Ed25519 seed into a PKCS#8 private key, since
/// Node's `createPrivateKey` needs a recognized key format rather than the
/// bare 32-byte seed the contract/tests deal in directly.
function rawEd25519SeedToPkcs8(seed) {
  const prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
  return Buffer.concat([prefix, seed]);
}

function buildMessage(op, nonce, argsHash) {
  const buf = Buffer.alloc(44);
  buf.writeUInt32BE(op, 0);
  // Node lacks a plain writeBigUInt64BE alias mismatch guard here; nonce is
  // a JS bigint to safely cover the full u64 range.
  buf.writeBigUInt64BE(nonce, 4);
  argsHash.copy(buf, 12);
  return buf;
}

function main() {
  const [privKeyHex, opStr, nonceStr, argsHashHex] = process.argv.slice(2);
  if (!privKeyHex || !opStr || !nonceStr || !argsHashHex) {
    usageAndExit();
  }

  const seed = hexToBuffer(privKeyHex, 32, 'private key');
  const argsHash = hexToBuffer(argsHashHex, 32, 'args hash');
  const op = Number.parseInt(opStr, 10);
  const nonce = BigInt(nonceStr);

  if (!Number.isInteger(op) || op < 0 || op > 0xffffffff) {
    usageAndExit('op must fit in a u32');
  }
  if (nonce < 0n || nonce > 0xffffffffffffffffn) {
    usageAndExit('nonce must fit in a u64');
  }

  const message = buildMessage(op, nonce, argsHash);
  const keyObject = createPrivateKey({
    key: rawEd25519SeedToPkcs8(seed),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = sign(null, message, keyObject);

  console.log(JSON.stringify({
    message_hex: message.toString('hex'),
    signature_hex: signature.toString('hex'),
  }, null, 2));
}

main();

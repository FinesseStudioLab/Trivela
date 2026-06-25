# Merkle Allowlist Walkthrough (#294)

The campaign contract supports a Merkle-allowlist mode: when an admin calls `set_merkle_root(root)`,
every subsequent `register(participant, leaf, proof)` is rejected unless the supplied
`(leaf, proof)` validates against the stored root. This document explains the leaf / proof shape,
walks the admin through generating a tree from a list of Stellar addresses, and shows how
participants register against it.

## Leaf format

A leaf is the SHA-256 of the participant's address serialised as Soroban's
`ScVal::scvAddress(ScAddress::Account)`:

```
leaf = sha256(scvAddress_xdr_bytes)
```

This convention is set by [`contracts/campaign/src/lib.rs`](../contracts/campaign/src/lib.rs) in the
`hash_pair` + `verify_merkle_proof` helpers. The CLI
([`scripts/generate-merkle.mjs`](../scripts/generate-merkle.mjs)) and the browser helper
([`frontend/src/lib/merkle.js`](../frontend/src/lib/merkle.js)) both emit byte-identical leaves so a
proof generated in either verifies against the on-chain root.

## Internal node format

Every internal node is the SHA-256 of its two children, **concatenated in lexicographic order**:

```
parent = sha256(min(a, b) || max(a, b))
```

Sorted-pair hashing makes proofs position-independent — a verifier doesn't need to know whether each
sibling was on the left or the right at its layer.

## End-to-end flow

```mermaid
sequenceDiagram
    Admin->>CLI/UI: addresses.csv
    CLI/UI->>CLI/UI: build tree (sorted + dedup leaves)
    CLI/UI-->>Admin: { root, proofs[] }
    Admin->>Campaign Contract: set_merkle_root(admin, nonce, root)
    Admin-->>Participant: per-participant (leaf, proof)
    Participant->>Campaign Contract: register(participant, leaf, proof)
    Campaign Contract->>Campaign Contract: verify_merkle_proof(leaf, proof, root)
    Campaign Contract-->>Participant: Ok(true) ✅
```

## Step 1 — generate the tree

### Option A — CLI

```bash
npm run merkle:generate -- --input addresses.csv --output proofs.json
```

The CLI:

1. Parses the input file (CSV or newline-delimited; both work).
2. Decodes every G-address to its 32-byte Ed25519 public key.
3. Wraps the raw key as `ScVal::ScvAddress(ScAddress::Account(...))` and computes
   `sha256(xdr_bytes)` → leaf.
4. Sorts + de-duplicates leaves, builds the tree with sorted-pair hashing.
5. Self-tests every emitted proof against the emitted root before writing the file. If the self-test
   fails the CLI exits non-zero — the output is never partially-written.

Output shape:

```json
{
  "root": "76f6...",
  "leafFormat": "sha256(stellar_address_xdr)",
  "proofs": {
    "GADDR...": { "leaf": "abcd...", "siblings": ["ef01...", "..."] },
    ...
  }
}
```

### Option B — Admin UI

The admin panel exposes the same flow as a file-upload widget on `AdminCampaigns.jsx`. The tree is
computed client-side via the WebCrypto SubtleCrypto API — no addresses leave the browser. The UI
emits the same JSON document as the CLI, so the two are interchangeable.

## Step 2 — push the root on-chain

Either the existing `AdminControlPanel` (frontend) or the Stellar CLI:

```bash
stellar contract invoke --id $CAMPAIGN_ID --source $ADMIN --network testnet \
  -- set_merkle_root --admin $ADMIN_ADDR --nonce $NONCE --root $ROOT_HEX
```

`set_merkle_root` is admin-only and consumes an `admin_nonce`. Read the current nonce via
`admin_nonce()` before invoking.

## Step 3 — distribute proofs

Give each participant their entry from the `proofs` map. The shape participants need is:

- `leaf` — 32-byte hex
- `siblings` — array of 32-byte hex sibling hashes (the Merkle proof)

A participant invokes `register` with `(participant, leaf, proof)`. The contract recomputes the path
from the leaf up using sorted-pair hashing and compares the result with the stored root — Ok(true)
on success, `Err(NotInAllowlist)` on mismatch.

## Verifying a proof outside the contract

`scripts/generate-merkle.mjs` exports `verifyProof(leaf, siblings, root)` and the browser helper
exports an async version of the same. Both run the identical sorted-pair walk the contract runs.

```javascript
import { addressToLeaf, verifyProof, hexToBytes } from 'trivela/frontend/src/lib/merkle';

const leaf = await addressToLeaf('GADDR...');
const ok = await verifyProof(leaf, proof.siblings.map(hexToBytes), hexToBytes(rootHex));
```

## Edge cases handled

- **Odd-leaf-out**: the rightmost leaf at any layer with an odd count is _promoted_ unchanged (no
  sibling recorded). Both the CLI and the contract handle this without special-casing the verifier.
- **Duplicate addresses**: leaves are de-duplicated before building. A participant in the input
  twice produces one leaf, one proof, and one valid registration.
- **Empty input**: the CLI exits 2 with a clear message. The UI surfaces an inline error.
- **Malformed address**: the CLI exits 1 with the line that failed validation. The UI surfaces the
  first invalid address in its error banner.

## Re-rooting an existing campaign

`set_merkle_root` can be called more than once. A new root replaces the previous one — proofs from
the previous root no longer validate. Use this to add late entries to the allowlist:

1. Add the new addresses to the source file.
2. Re-run `npm run merkle:generate` → new `root`, new `proofs.json`.
3. Push the new root on-chain.
4. Re-distribute the new proofs to the affected participants.

Already-registered participants keep their registration — the root check only runs on `register`.
There's no need to back-fill them.

# Key management & multisig runbook (issue #839)

Covers the ed25519 co-admin multisig used to gate privileged rewards-contract operations
(`verify_multisig` in `contracts/rewards/src/lib.rs`), and the primary admin key it sits alongside.

## Roles

- **Primary admin** — a single Stellar `Address`, set at `initialize()` and transferable via
  `transfer_admin`. Required (via `require_admin`/`require_admin_with_nonce`) for most privileged
  entrypoints regardless of multisig configuration.
- **Co-admins** — up to several ed25519 keypairs registered via `add_co_admin(admin, co_admin,
  pubkey)`. Once `MULTISIG_THRESHOLD` is set to a non-zero value (via the contract's multisig
  config), operations gated by `verify_multisig` require signatures from at least that many distinct
  registered co-admins, in addition to the primary admin's own auth.

The primary admin and co-admins are **separate mechanisms that compose**: the primary admin key
alone can call admin-only entrypoints that don't route through `verify_multisig`; entrypoints that
do route through it additionally require the co-admin quorum. Losing the primary admin key is more
severe (no path recovers it without a working `transfer_admin` call signed by the old key), so it
warrants the strictest custody below.

## Key generation

- Generate the primary admin key and every co-admin key **offline, on an air-gapped machine or
  hardware wallet**, never on a machine that also holds deployment credentials or CI secrets.
- Stellar/Soroban `Address` keys (primary admin, and each co-admin's on-chain identity) are standard
  Stellar keypairs — use the Stellar CLI (`stellar keys generate`) or a hardware wallet's native
  Stellar support.
- Co-admin **ed25519 signing keys** (the raw 32-byte seed registered via `add_co_admin`'s `pubkey`
  argument) are a *separate* keypair from that co-admin's Stellar address — the address identifies
  who registered the key and authorizes `add_co_admin`/`remove_co_admin` calls; the ed25519 keypair
  is what actually signs `(op, nonce, args_hash)` payloads off-chain. Do not reuse a Stellar
  account's signing key as this ed25519 key, and do not derive one from the other — generate the
  ed25519 seed independently (e.g. `openssl genpkey -algorithm ed25519` or a hardware token's
  ed25519 support) so compromising one does not compromise the other.

## Storage

- **Primary admin key:** HSM or hardware wallet (Ledger/Trezor-class device) only. Never stored as a
  plaintext seed on any networked machine, including deployment/CI runners.
- **Co-admin ed25519 seeds:** one per co-admin, each held by a different individual/team, each on
  its own hardware token or HSM. No single machine or person should hold more than one co-admin's
  seed — the entire point of the quorum is that compromising fewer than `MULTISIG_THRESHOLD` seeds
  cannot authorize an operation.
- Back up each key's recovery material (seed phrase / HSM backup) in a separate physical location
  from the device itself, following the same custody standard as the live key.

## Quorum

- Set `MULTISIG_THRESHOLD` (via the contract's multisig configuration call) to a value strictly less
  than the number of registered co-admins, so the loss of any single co-admin key doesn't brick the
  quorum, but no single compromised key can authorize an op alone. A 3-of-5 or 4-of-7 split is a
  reasonable starting point for mainnet.
- Review the threshold whenever the co-admin set changes size (`add_co_admin`/`remove_co_admin`) —
  it does not auto-adjust.

## Rotation

1. Generate the new key material offline, per "Key generation" above.
2. For a co-admin rotation: call `add_co_admin(admin, co_admin_address, new_pubkey)` to overwrite
   the registered key for that co-admin (this is idempotent by address — see the doc comment on
   `add_co_admin`), then securely destroy the old seed.
3. For a primary admin rotation: call `transfer_admin` to the new admin address, confirm the new
   admin can successfully call an admin-only read (e.g. a config getter behind `require_admin`)
   before destroying the old key.
4. Rotate on a fixed schedule (recommended: annually, or immediately on suspected compromise) and
   after any change in personnel with custody responsibility.

## Incident revocation

If a co-admin key is suspected compromised:

1. Immediately call `remove_co_admin(admin, co_admin_address)` — this requires only the primary
   admin, not the multisig quorum, so it works even if the compromised key is one of the quorum's
   signers.
2. If the primary admin key itself is suspected compromised, this is the severe case with no
   in-contract remedy beyond whatever `transfer_admin` call can still be raced through before an
   attacker acts — this is why the primary admin key's custody standard (above) must be the
   strictest of all.
3. After removal, re-evaluate `MULTISIG_THRESHOLD` against the reduced co-admin set and register a
   replacement co-admin if the quorum would otherwise become too small to reach in practice.

## Reference signing script

`scripts/multisig-sign.mjs` reproduces the exact 44-byte `(op, nonce, args_hash)` message format
`verify_multisig`/`multisig_message` expect (see the comments in
`contracts/rewards/src/lib.rs`) and signs it with Node's built-in ed25519 support — no external
dependencies, so it's auditable without trusting a third-party crypto package.

```bash
node scripts/multisig-sign.mjs <private-key-hex-32B> <op-u32> <nonce-u64> <args-hash-hex-32B>
```

### Test vector

```
private key (hex): 0707070707070707070707070707070707070707070707070707070707070707
op:                1
nonce:              42
args hash (hex):    0000000000000000000000000000000000000000000000000000000000000000

$ node scripts/multisig-sign.mjs \
    0707070707070707070707070707070707070707070707070707070707070707 \
    1 42 \
    0000000000000000000000000000000000000000000000000000000000000000

{
  "message_hex": "00000001000000000000002a0000000000000000000000000000000000000000000000000000000000000000",
  "signature_hex": "b42538c9e10a2e1229a136f6809f0ec8b4f7c9ab7299dd7f0f53a701a61bb166c55e9fd409072a4c06aeceed12ce44cd1ef7726a650c3a146a7a47e59c6f340d"
}
```

`message_hex` decodes to `op=00000001` (u32 BE) + `nonce=000000000000002a` (u64 BE, 42 decimal) +
the 32-byte all-zero `args_hash` — matching `multisig_message()`'s layout byte-for-byte. Re-running
the script with the same inputs reproduces the same `signature_hex` (ed25519 signing is
deterministic), so this vector can be used to check any reimplementation of the signer against this
one.

# Reproducible builds & provenance (issue #775)

Anyone should be able to rebuild the deployed contract WASM from a release tag and get the exact
published hash, so the community can independently verify that what's on-chain matches reviewed
source.

## What's in place now

- **Pinned toolchain** ([`rust-toolchain.toml`](../rust-toolchain.toml)): an exact `rustc` version
  (not a floating `stable` channel) plus the `wasm32v1-none` target, so every build — CI or local —
  uses the identical compiler. `contracts-ci.yml` previously used `dtolnay/rust-toolchain@stable`,
  which can silently pick up a different rustc release on a different day; that's incompatible with
  reproducibility and should be updated to respect this pinned file (see "Follow-up" below).
- **`scripts/reproducible-build.sh`**: builds a given contract package twice, from a clean
  `CARGO_TARGET_DIR` each time, with `SOURCE_DATE_EPOCH` fixed and `--locked --release --target
  wasm32v1-none`, and asserts both passes produce byte-identical WASM (verified via `sha256`).
  Exits non-zero on any mismatch.

  ```bash
  scripts/reproducible-build.sh trivela-rewards-contract trivela-campaign-contract
  ```

## How to verify a deployed contract

1. Check out the exact release tag the contract was deployed from.
2. Run `scripts/reproducible-build.sh <package-name>`.
3. Compare the printed hash against the hash published for that release/tag (see "Publishing" below).
4. Compare that same hash against the on-chain WASM hash for the deployed contract instance
   (`stellar contract info` / the Soroban RPC `getLedgerEntry` for the contract's `ContractCode`
   entry exposes this).

If all three match, the deployed bytecode is provably the reviewed source at that tag.

## Publishing (per release)

Each tagged release should publish, alongside the release itself:

- The `sha256` of each contract's WASM, produced by `scripts/reproducible-build.sh`.
- The exact `rust-toolchain.toml` and `Cargo.lock` used (already committed at that tag, but calling
  them out in the release notes makes the rebuild recipe self-contained without needing to inspect
  the repo separately).

## Follow-up (not done in this pass)

This establishes the reproducibility half of the issue — a deterministic build with a verifiable
hash. Two pieces from the issue's full scope are **not** implemented here and are called out
explicitly rather than silently left incomplete:

1. **CI wiring to update `dtolnay/rust-toolchain@stable` → respect `rust-toolchain.toml`.**
   `contracts-ci.yml` and `contract-fuzzing.yml` both currently install the floating `stable`
   channel explicitly, which will silently diverge from the pinned toolchain over time. Swapping to
   `dtolnay/rust-toolchain@master` with `toolchain-file: rust-toolchain.toml` (or removing the
   explicit channel entirely, since `rustup` respects `rust-toolchain.toml` automatically once
   present) is a small follow-up, deliberately not bundled into this change to keep this PR's diff
   scoped to what's needed for issue #775 specifically.
2. **SLSA/in-toto provenance attestation and tying the hash to the upgrade allowlist.** Signed,
   third-party-verifiable provenance (e.g. via `slsa-github-generator` or `cosign`/`sigstore`) and
   wiring the attested hash into the contract's own upgrade-allowlist check (so `upgrade()` itself
   refuses an unattested WASM hash) are both real infrastructure projects in their own right —
   requiring CI signing-identity setup and a design decision about how the on-chain allowlist is
   populated and rotated. Flagging this rather than shipping a half-built attestation pipeline.

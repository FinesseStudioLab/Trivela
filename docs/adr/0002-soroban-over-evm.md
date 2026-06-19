# ADR-002: Use Soroban (Stellar) over EVM chains

**Status:** Accepted  
**Date:** 2024-12-01

## Context

Trivela needs on-chain smart contracts for reward accounting and campaign participation gating.
Options considered: Ethereum/EVM (Solidity), Solana (Anchor/Rust), Stellar Soroban (Rust), Cosmos
CosmWasm (Rust).

## Decision

Use **Stellar Soroban** smart contracts written in Rust.

## Reasons

1. **Target audience** — Trivela is built as part of the Stellar Wave program; Soroban is the
   natural fit and is supported by Stellar Development Foundation grants and developer tooling.
2. **Rust + `#![no_std]`** — the Soroban SDK compiles to deterministic Wasm with no heap allocations
   at the SDK boundary. Strong type safety eliminates entire classes of reentrancy and overflow bugs
   common in Solidity.
3. **Low fees** — Stellar network fees are fractions of a cent; this is critical for a rewards
   platform where `batch_credit` may touch many accounts per tx.
4. **Built-in auth model** — `Address::require_auth()` handles multi-sig and contract-auth without
   custom access-control libraries.
5. **`soroban-sdk` testability** — `Env::default()` with `mock_all_auths()` gives a fast, hermetic
   unit-test environment without running a full node.

## Consequences

- **Positive:** Deterministic Wasm execution; easier formal reasoning.
- **Positive:** Schema migration pattern (`migrate()` + `schema_version()`) is well-supported by
  Soroban's instance storage model.
- **Negative:** Smaller ecosystem of auditors and tooling compared to EVM.
- **Negative:** Soroban SDK is still evolving (breaking changes between 22.x → 25.x observed during
  development). Contributors must pin `soroban-sdk` in `Cargo.toml` and review release notes before
  upgrading.
- **Negative:** Frontend must use `@stellar/stellar-sdk` instead of the more widely known
  `ethers.js` / `viem` ecosystem.

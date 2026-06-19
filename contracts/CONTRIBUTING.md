# Contributing to Trivela Smart Contracts

> **Prerequisites:** Familiarity with Soroban smart contracts, Rust, and Stellar concepts. New to
> Trivela terminology? See the [Glossary](../docs/GLOSSARY.md).

This guide covers environment setup, coding standards, testing patterns, and common pitfalls for the
Soroban smart contracts in `contracts/`. It supplements the main
[CONTRIBUTING.md](../CONTRIBUTING.md).

---

## Table of Contents

- [Environment Setup](#environment-setup)
- [Running Tests](#running-tests)
- [Contract Coding Standards](#contract-coding-standards)
- [Common Pitfalls](#common-pitfalls)
- [Review Checklist](#review-checklist)
- [Testing Upgrades](#testing-upgrades)

---

## Environment Setup

### 1. Rust Toolchain

Install **Rust stable** (minimum supported version: 1.79):

```bash
rustup install stable
rustup default stable
```

### 2. WASM Target

Soroban contracts compile to WebAssembly. Add the target:

```bash
rustup target add wasm32-unknown-unknown
```

### 3. Soroban CLI (Stellar CLI)

Install the **Stellar CLI** — the official tool for building, deploying, and interacting with
Soroban contracts:

```bash
cargo install --locked stellar-cli
```

> **Version compatibility:** Ensure your Stellar CLI version matches the Soroban SDK version used by
> the contracts. Check the SDK version in `contracts/campaign/Cargo.toml` and
> `contracts/rewards/Cargo.toml`, then verify:
>
> ```bash
> stellar --version
> ```
>
> The `stellar-cli` release should correspond to the same `soroban-sdk` crate version. Mismatches
> can cause build failures or runtime errors due to XDR encoding changes.

### 4. Verify Setup

Run the contract test suite from the repository root:

```bash
cargo test --workspace
```

All tests should pass. If you encounter WASM-related linker errors, verify the
`wasm32-unknown-unknown` target is installed.

---

## Running Tests

### Run All Contract Tests

```bash
cargo test --workspace
```

### Run Tests with Verbose Output

Use `--nocapture` to see `println!` and detailed failure messages:

```bash
cargo test -- --nocapture
```

### Run a Single Test

Filter by test name:

```bash
cargo test test_name_pattern -- --nocapture
```

For example:

```bash
cargo test test_register_participant -- --nocapture
```

### Run Tests for a Specific Contract

```bash
cargo test --package trivela-campaign
cargo test --package trivela-rewards
```

---

## Contract Coding Standards

### Use `require_auth()` Correctly

In Soroban, **authorization** (authenticating a user's intent) is done via
`Address::require_auth()`. This is not the same as authentication (verifying identity) — it confirms
that the user's signature is present for a specific operation.

```rust
// ✅ CORRECT: Use require_auth() for operations where the user
// is authorizing an action on their own behalf
pub fn register(env: Env, participant: Address) {
    participant.require_auth();
    // ... register logic
}

// ✅ CORRECT: Admin-protected operations also use require_auth()
// on the admin address, with additional checks that the caller IS the admin
pub fn set_active(env: Env, admin: Address, nonce: u64, active: bool) -> Result<(), Error> {
    require_admin_with_nonce(&env, &admin, nonce)?;
    // ... set active logic
}

// ❌ WRONG: Do not use require_auth() for admin-only operations
// without also verifying the address matches the stored admin
pub fn set_window(env: Env, admin: Address) {
    admin.require_auth(); // This alone is insufficient!
    // The stored admin address should also be verified
}
```

**Key rules:**

- Always verify that the authenticated address matches the expected stored address for admin
  operations
- Do not rely solely on `require_auth()` — pair it with an address comparison
- Use `require_admin_with_nonce()` for admin operations to prevent replay attacks

### Always Bump TTL on Storage Writes

Soroban contract storage entries have a **Time-To-Live (TTL)**. If an entry's TTL expires, the data
is lost. **Every state-mutating function must extend the TTL** of the relevant storage entries.

```rust
// ✅ CORRECT: Always extend TTL after writing to instance storage
env.storage().instance().set(&SOME_KEY, &value);
env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

// ✅ CORRECT: Also extend TTL for persistent storage entries
env.storage().persistent().set(&key, &value);
env.storage().persistent().extend_ttl(&key, THRESHOLD, EXTEND_TO);

// ❌ WRONG: Setting a value without extending TTL
env.storage().instance().set(&SOME_KEY, &value);
// TTL not bumped — entry may expire!
```

See [TTL_STRATEGY.md](../docs/TTL_STRATEGY.md) for the full rationale and production threshold
values.

### Use `panic_with_error!` Not `panic!()`

Always use typed error enums rather than raw string panics. This ensures errors are catchable and
propagate correctly through Soroban's error handling.

```rust
// ✅ CORRECT: Use the Error enum and panic with a typed error
#[contracterror]
#[repr(u32)]
pub enum Error {
    Unauthorized = 100,
    InsufficientBalance = 2,
}

fn my_function() -> Result<(), Error> {
    if some_condition {
        return Err(Error::Unauthorized);
    }
    Ok(())
}

// Or use unwrap/expect strategically:
let value = env.storage().instance().get(&KEY).unwrap_or(default);

// ❌ WRONG: Raw panic!() calls cannot be caught as typed errors
panic!("Something went wrong");
```

### Prefer `i128` for Amounts, Not `u64`

While the current contracts use `u64` for most amounts, new code should prefer `i128` for financial
values that may need to scale in the future. This provides:

- **Future-proofing:** Higher maximum values (Soroban supports up to `i128` in the ledger)
- **Overflow safety:** `checked_add` / `checked_mul` semantics
- **Interoperability:** Many Stellar/Soroban financial primitives use `i128`

```rust
// ✅ PREFERRED for new code
pub fn process_payment(env: Env, amount: i128) -> Result<i128, Error> {
    let current: i128 = env.storage().instance().get(&KEY).unwrap_or(0);
    let new_balance = current.checked_add(amount).ok_or(Error::Overflow)?;
    env.storage().instance().set(&KEY, &new_balance);
    Ok(new_balance)
}

// Acceptable for legacy code — but migrate to i128 when making significant changes
let amount: u64 = 100;
```

---

## Common Pitfalls

### Storage Key Collisions

When using tuples as storage keys, ensure the tuple serialization is unique. Two different logical
keys can collide if their components produce the same XDR serialization.

```rust
// Potential collision: (Symbol, Address) and (Address, Symbol) could collide
// if the types are not clearly distinguished.

// ✅ Safe pattern: Use distinct symbol prefixes for different key namespaces
const BALANCE: Symbol = symbol_short!("balnce");
const PARTICIPANT: Symbol = symbol_short!("partic");

// Storage keys are namespaced by symbol prefix
env.storage().instance().set(&(BALANCE, user.clone()), &amount);
env.storage().persistent().set(&(PARTICIPANT, participant.clone()), &true);
```

**Always test for key collisions** when introducing new storage patterns.

### TTL Not Bumped Causes State Loss

This is the **most common production bug** in Soroban contracts. If TTL is not extended on writes,
the contract's entire state can be wiped when the instance storage TTL expires.

- **Instance storage:** Shared by all users; if TTL expires, the contract appears unininitialized
- **Persistent storage:** Per-key TTL; each entry can expire independently

**Mitigation:**

- Every `set()` or `remove()` call on instance storage must be followed by `extend_ttl()`
- Every `set()` on persistent storage should extend the key's TTL
- Read-only `get()` calls do NOT need TTL extension (but are harmless if present)

### Admin Nonce Replay

Admin operations use a nonce to prevent replay attacks. The `ADMIN_NONCE` counter increments on each
admin call. If a transaction is submitted twice, the second attempt will fail because the nonce
doesn't match.

```rust
// Admin must provide the current nonce value
let nonce: u64 = env.storage().instance().get(&ADMIN_NONCE).unwrap_or(0);
// The require_admin_with_nonce function checks this and increments it
```

**Important:** Off-chain callers must track the admin nonce state and submit the correct value.
After each admin operation, the nonce increments by 1.

### Testing Window Constraints in Tests

When writing tests, be aware that Soroban test environments provide a default ledger timestamp. Use
`env.ledger().with_mutable_seq(|seq| { ... })` or adjust timestamps in test helper functions to
properly test window boundaries.

---

## Review Checklist

Before submitting a smart contract PR, verify the following:

- [ ] **Invariants preserved**: State invariants (e.g., count == number of participants, total
      supply == sum of balances) hold before and after the change
- [ ] **TTL bumped**: Every storage write extends the relevant TTL (instance and/or persistent)
- [ ] **Events emitted**: All state changes that affect external callers have corresponding events
- [ ] **Error types used**: `panic_with_error!` or `Err(Error::Variant)` used; no raw `panic!()`
      calls
- [ ] **Tests added**: New functionality has unit tests; edge cases are covered
- [ ] **Admin nonce**: Admin-protected functions use `require_admin_with_nonce()` (not bare
      `require_auth()`)
- [ ] **Storage keys**: No key collision risk; new keys use distinct symbol prefixes
- [ ] **No breaking changes**: Public function signatures remain backward compatible unless
      explicitly versioned
- [ ] **Documentation**: Public functions have `///` doc comments; events documented in the
      module-level doc string
- [ ] **Fuzz testing**: For new logic paths, fuzz targets in `contracts/*/fuzz/` are added or
      updated

---

## Testing Upgrades

Trivela supports contract upgrades via the Soroban `migrate()` pattern. To test upgrade flows:

### Upgrade Test Harness

An upgrade test harness is available (see
[issue #445](https://github.com/FinesseStudioLab/Trivela/issues/445)). The harness provides:

1. **Deploy old contract** — Deploy the current (pre-upgrade) version
2. **Seed state** — Execute transactions to populate storage
3. **Upgrade** — Deploy new WASM and call `migrate()`
4. **Verify** — Assert that state survived the upgrade and new features work

```rust
// Example upgrade test pattern (see contracts/integration/tests/ for full harness):

#[test]
fn test_upgrade_preserves_state() {
    let env = Env::default();
    let contract_id = env.register_contract(None, OldContract);
    let client = OldContractClient::new(&env, &contract_id);

    // Seed state
    client.initialize(&admin);

    // Upgrade to new WASM
    env.deployer().update_current_contract_wasm(NewContractWasm);
    client.migrate(&admin, &1);

    // Verify state preserved
    assert!(client.is_initialized());
}
```

### Integration Test Setup

For full end-to-end upgrade tests, use the integration test setup in `contracts/integration/`:

```bash
cd contracts/integration
cargo test -- --nocapture test_upgrade
```

The integration tests deploy contracts, execute pre-upgrade transactions, simulate upgrades, and
validate post-upgrade state.

---

## Questions?

Open a [Discussion](https://github.com/FinesseStudioLab/Trivela/discussions) or tag maintainers in
an issue.

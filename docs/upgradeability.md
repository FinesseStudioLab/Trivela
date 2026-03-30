# Soroban Contract Upgradeability

This document describes the upgradeability patterns used in Trivela smart contracts, covering the mechanism, upgrade process, storage considerations, and security model.

---

## Overview

Trivela contracts are upgradeable using Soroban's built-in **in-place WASM upgrade** mechanism. Unlike EVM proxy patterns (EIP-1967), Soroban upgrades replace the contract's bytecode directly while preserving all on-chain storage. There is no separate proxy contract or fallback mechanism.

**Key properties:**
- Contract address remains unchanged after an upgrade
- All persistent storage (`instance()` and `persistent()`) is preserved automatically
- Only the logic (WASM bytecode) changes
- Admin authority is required for all upgrades

---

## Mechanism: `update_current_contract_wasm`

Soroban provides a first-class upgrade API via the `deployer`:

```rust
env.deployer().update_current_contract_wasm(new_wasm_hash);
```

Calling this function replaces the WASM bytecode associated with the current contract ID. The call requires `require_auth()` from the admin, ensuring only the designated administrator can trigger upgrades.

### Requirements

1. **Admin authentication** — the caller must be the stored admin address.
2. **WASM hash** — the new WASM must already be installed on the network (not uploaded as part of the upgrade transaction). The hash is a `BytesN<32>` value obtained during the `stellar contract install` step.
3. **State compatibility** — the new contract code must be able to read all existing storage keys. Adding new keys is safe; removing, reordering, or changing the type of existing keys will corrupt data.

---

## Storage Compatibility Rules

When upgrading a contract, persistent state lives in Soroban storage regions:

| Storage region | Persisted across upgrade? | Upgrade risk |
|---|---|---|
| `instance()` | ✅ Yes | Changing existing key types or order breaks reads |
| `persistent()` | ✅ Yes | Same as above |
| `temporary()` | ❌ No (cleared) | Not used in Trivela contracts |

### Safe changes in new contract versions

- ✅ Adding new storage keys
- ✅ Adding new public or private functions
- ✅ Extending event schemas (adding new topics)
- ✅ Relaxing validation (e.g., accepting wider input ranges)
- ✅ Adding new error variants (append only to `Error` enum)

### Breaking changes (must avoid)

- ❌ Removing or renaming existing storage keys
- ❌ Changing the type of an existing stored value
- ❌ Reordering fields in a stored struct without migration logic
- ❌ Removing public functions that integrators depend on
- ❌ Tightening validation that would reject previously valid states

### Storage layout example (RewardsContract)

The rewards contract stores these keys in `instance()`:

| Key | Type | Purpose |
|---|---|---|
| `admin` (Symbol) | `Address` | Admin identity for upgrade, pause, credit |
| `balance:<Address>` (tuple) | `u64` | Per-user points balance |
| `claimed` (Symbol) | `u64` | Total cumulative claims |
| `metadata` (Symbol) | `(Symbol, Symbol)` | Token name and symbol |
| `paused` (Symbol) | `bool` | Pause state |
| `mxcredit` (Symbol) | `u64` | Max credit per single call (0 = unlimited) |

New contract versions MUST preserve all of the above with identical types. New keys can be added freely.

---

## Upgrade Process

### Prerequisites

- Stellar CLI (`stellar`) installed
- Admin keypair for the deployed contract
- New WASM file (built from the updated Rust source)

### Step 1: Build the new WASM

```bash
cd contracts/rewards
cargo build --target wasm32-unknown-unknown --release
```

Output: `contracts/rewards/target/wasm32-unknown-unknown/release/rewards.wasm`

### Step 2: Install the new WASM on the network

```bash
stellar contract install \
  --source <ADMIN_SECRET_KEY> \
  --network testnet \
  contracts/rewards/target/wasm32-unknown-unknown/release/rewards.wasm
```

Output: a `wasm_hash` (e.g., `7f6b700860c007a65e7bef9e4d05e7e6...`)

### Step 3: Invoke the upgrade function

```bash
stellar contract invoke \
  --source <ADMIN_SECRET_KEY> \
  --network testnet \
  --id <CONTRACT_ID> \
  -- \
  upgrade \
  --admin <ADMIN_ADDRESS> \
  --new_wasm_hash <WASM_HASH>
```

### Step 4: Verify

```bash
stellar contract invoke \
  --network testnet \
  --id <CONTRACT_ID> \
  -- \
  is_paused

stellar contract invoke \
  --network testnet \
  --id <CONTRACT_ID> \
  -- \
  balance \
  --user <ANY_USER_ADDRESS>
```

Both should return correct values, confirming storage was preserved.

---

## Admin Security

The upgrade function is protected by two layers:

1. **`require_auth()`** — the caller must prove ownership of the admin keypair (signs the transaction).
2. **Stored admin check** — the signed admin address must match the `admin` stored in the contract's instance storage.

```rust
fn require_admin(env: &Env, admin: &Address) -> Result<(), Error> {
    admin.require_auth();
    let stored_admin: Address = env.storage().instance().get(&ADMIN).unwrap();
    if &stored_admin != admin {
        return Err(Error::Unauthorized);
    }
    Ok(())
}
```

### Operational security recommendations

- **Multisig** — use a multisig wallet (e.g., Horizen) as the admin, not a single key. This prevents single-point-of-failure upgrades.
- **Timelock** — consider a timelock between announcing an upgrade and executing it, giving users time to assess changes.
- **Upgrade announcements** — post upgrade plans to the project GitHub/Discord before executing, allowing community review.
- **Test on testnet first** — always deploy and test the new WASM on testnet before mainnet, verifying storage reads correctly.
- **Backup storage** — before upgrading on mainnet, snapshot the relevant storage values (e.g., total balance per user) so you can compare post-upgrade.

---

## Rollback

Soroban does not have a built-in rollback mechanism. If a bad upgrade is deployed:

**Option 1: Re-upgrade**  
If the new code has a critical bug, deploy another upgrade with the corrected WASM hash. This is the only option if storage was corrupted.

**Option 2: Deploy fresh**  
Deploy a new instance of the contract with a new contract ID and migrate users. This abandons the old contract address and requires updating all frontend configuration.

**Prevention is critical:**
- Thoroughly test upgrades on testnet with realistic storage states
- Use formal verification for critical storage invariants
- Keep the previous WASM hash documented so a known-good version can be re-deployed quickly

---

## Proxy Pattern (Alternative)

While Trivela uses the direct upgrade pattern, a **proxy pattern** is common in more complex setups. It separates the contract logic (implementation) from a persistent proxy contract that delegates calls. This allows:

- Switching implementations without redeploying the proxy
- Running multiple implementations simultaneously
- More granular access control over which admin can change what

Soroban supports this via a separate proxy contract that stores the `wasm_hash` of the current implementation and a fallback mechanism for unknown function selectors.

However, the proxy pattern adds complexity and gas overhead. For a focused rewards/campaign platform like Trivela, the direct upgrade pattern strikes the right balance between flexibility and simplicity.

---

## Campaign Contract

The campaign contract (`contracts/campaign`) follows the same upgradeability pattern as the rewards contract. It stores:

| Key | Type | Purpose |
|---|---|---|
| `admin` | `Address` | Admin identity |
| `campaign:<id>` | `Campaign` struct | Campaign metadata and state |
| `participant:<campaign>:<address>` | `bool` | Participation status |

When upgrading the campaign contract, preserve these keys. The same storage compatibility rules apply.

---

## References

- [Soroban Upgradeable Contracts docs](https://developers.stellar.org/docs/smart-contracts/upgradeable-contracts)
- [Soroban SDK `deployer` API](https://docs.rs/soroban-sdk/latest/soroban_sdk/struct.Deployer.html)
- [Stellar CLI contract commands](https://developers.stellar.org/docs/tools/stellar-cli/contract)

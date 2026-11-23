# Soroban Contract Upgradeability & Migration

Trivela contracts keep state at stable contract IDs and evolve logic through Soroban Wasm
upgrades.  
To make storage evolution explicit and reviewable, each contract now exposes:

- `schema_version() -> u32`
- `migrate(admin, target_version) -> Result<u32, Error>`

Both `campaign` and `rewards` contracts currently use **schema version `1`**.

## Migration Entry Point Strategy

1. **Schema is explicit**  
   `initialize` persists `schema_v = 1`.
2. **Admin-gated migration**  
   `migrate` requires admin auth and validates supported target versions.
3. **Idempotent current migration**  
   Calling `migrate(..., 1)` is safe and returns `1`.
4. **Forward-safe failure mode**  
   Unsupported versions return `UnsupportedMigration` instead of mutating state.

This makes migration behavior deterministic for CI and rollout scripts.

## Storage Tier Migration: Participant Records (Issue #280)

The campaign contract previously stored per-participant registration records in **instance storage**
under `(PARTICIPANT, participant)`. Soroban instance storage shares a single ~64KB envelope with the
contract code, so a viral campaign would silently brick somewhere around 1.8k participants (each
`Address` is ~35 bytes in XDR).

As of this release, participant records live in **persistent storage**:

```rust
// register()
env.storage().persistent().set(&key, &true);
env.storage().persistent().extend_ttl(&key, threshold, extend_to);

// is_participant()
env.storage().persistent().get(&key)

// do_deregister()
env.storage().persistent().remove(&key);
```

`PARTICIPANT_COUNT` (the aggregate) stays in instance storage — it's a single counter, not per-user,
and pulling it out doesn't help.

### Impact on already-live campaigns

A `campaign` contract deployed under schema v1 (instance-storage participants) is **not
auto-migrated** by `migrate(admin, 2)` — moving keys across storage tiers requires reading from one
tier and writing to the other, which we can only do safely if the registry of participants is known.
The recommended procedure for a deployer:

1. Drain the campaign (set inactive via `set_active(admin, n, false)`).
2. Read every registered address via your indexer / event log (`register` events are public).
3. Deploy the new Wasm and `upgrade --new_wasm_hash <HASH>`.
4. Call `register(...)` for each historical participant — the new call writes to persistent storage.
   Idempotency is guaranteed because the contract returns `false` for already-registered
   participants.
5. Re-activate via `set_active(admin, n+1, true)`.

For new campaigns deployed after this release, no migration is needed — the first `register` call
already targets persistent.

### TTL tuning

Two constants in `contracts/campaign/src/lib.rs` control how aggressively each registration
refreshes its key's TTL:

```rust
const PARTICIPANT_TTL_THRESHOLD: u32 = 100;
const PARTICIPANT_TTL_EXTEND_TO: u32 = 500;
```

These are deliberately modest for the initial rollout. Production deployers running long campaigns
should tune them in a follow-up contract release — moving them out into per-campaign admin-settable
storage is appropriate once traffic patterns are known.

## Operational Upgrade Runbook

1. Build and upload new Wasm:

```bash
stellar contract build
stellar contract install --wasm <updated_contract.wasm> --source <admin> --network testnet
```

2. Upgrade contract code (admin path):

```bash
stellar contract invoke --id <CONTRACT_ID> --source <admin> --network testnet -- \
  upgrade --new_wasm_hash <WASM_HASH>
```

3. Run migration hook:

```bash
stellar contract invoke --id <CONTRACT_ID> --source <admin> --network testnet -- \
  migrate --target_version <VERSION>
```

4. Verify:

```bash
stellar contract invoke --id <CONTRACT_ID> --source <admin> --network testnet -- \
  schema_version
```

## Storage Consistency Guardrails

- Never repurpose a key with incompatible value type.
- Introduce new keys for new fields; preserve old keys until migrated.
- Keep `migrate` pure/idempotent per target version.
- Add test coverage for:
  - initial schema version
  - successful migrate at current version
  - unsupported version rejection
  - unauthorized caller rejection

## Production Upgrade Strategy & Governance Architecture

For mainnet operations, upgrades must follow a strict, multi-layer verification and authorization process to prevent unauthorized code replacement, accidental state invalidation, or rug-pull risks.

### 1. Upgrade Authority Model (Who Can Trigger Upgrades)

- **Testnet vs. Mainnet Distinction**:
  - On **testnet**, direct admin execution (`stellar contract invoke ... upgrade`) is permitted for operational agility.
  - On **mainnet**, single-signature private key upgrades are **strictly prohibited**.
- **Multi-Signature Admin & Role Separation**:
  - The contract admin MUST be a multi-signature account (e.g. 3-of-5 threshold) managed by distinct core contributors or an on-chain DAO governance executor.
  - **Proposer vs. Executor Separation**:
    - **Proposer**: Submits an upgrade proposal containing the target contract ID, the compiled Wasm bytecode hash (`new_wasm_hash`), and the intended `schema_version`.
    - **Verifier**: Core review team and external security auditors verify the bytecode hash matches audited source code.
    - **Executor**: Time-locked multisig account executes the upgrade transaction once the review delay has elapsed.

### 2. Time-Lock Delay Mechanism

Upgrades introduce architectural changes and must grant users and liquidity providers sufficient advance notice.

- **Mandatory Delay Window**:
  - Mainnet upgrades require a minimum time-lock delay of **48 hours (172,800 seconds)** from on-chain proposal announcement to invocation.
  - Emergency security patches (critical zero-day vulnerability fixes) require a minimum **12-hour delay** with a supermajority sign-off (e.g. 4-of-5 multisig signers).
- **Public Audit Window**:
  - During the time-lock delay, off-chain monitoring services and users can observe the queued Wasm hash on Stellar Expert / indexer.
  - If users disagree with logic changes, the delay affords sufficient time to withdraw rewards, settle active campaigns, or deregister participants before code takes effect.

### 3. Wasm Bytecode Verification & Reproducibility (How to Verify the New Wasm)

Before any upgrade transaction is approved, the candidate Wasm bytecode must be independently verified by reviewers using reproducible build toolchains:

1. **Deterministic Build in Container**:
   Build contracts inside pinned official Stellar build environments:
   ```bash
   # Build contract deterministically using pinned cargo & Soroban SDK
   stellar contract build --package trivela-campaign-contract
   ```
2. **Compute SHA-256 Hash of Bytecode**:
   ```bash
   sha256sum target/wasm32-unknown-unknown/release/trivela_campaign_contract.wasm
   # Outputs: <64-hex SHA-256 hash>
   ```
3. **Verify Installed Bytecode On-Chain**:
   Before calling `upgrade`, verify that the installed Wasm hash matches the locally compiled hash:
   ```bash
   # Retrieve bytecode directly from the network
   stellar contract inspect --wasm-hash <NEW_WASM_HASH> --network mainnet
   ```
4. **Pre-Upgrade Invariant Verification**:
   - Run formal verification harnesses (`contracts/rewards/formal` and `cargo kani`) against the new Wasm.
   - Run storage simulation against a fork of current mainnet contract state (`stellar contract invoke ... --simulate`) to verify that all existing storage entries remain valid and readable.

### 4. Two-Step Rollout & Emergency Rollback Protocol

1. **Step 1: Code Upgrade (`upgrade`)**:
   Invokes `env.deployer().update_current_contract_wasm(new_wasm_hash)`. This updates execution bytecode without altering stored state.
2. **Step 2: Schema Migration (`migrate`)**:
   Executes version-gated migration logic. If migration encounters invalid records or unsupported version jumps, it fails closed with `Error::UnsupportedMigration` and leaves storage intact.
3. **Emergency Rollback Procedure**:
   - The previous approved Wasm hash (`PREVIOUS_WASM_HASH`) is retained in operational runbooks.
   - If unexpected runtime anomalies or indexer synchronization issues occur post-upgrade:
     1. Admin immediately triggers `set_active(admin, false)` to pause sensitive campaign operations.
     2. Admin invokes `upgrade --new_wasm_hash <PREVIOUS_WASM_HASH>` to revert bytecode.
     3. Historical backward-compatible storage keys ensure the previous code can resume operations without data corruption.

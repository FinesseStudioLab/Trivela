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

## Future: upgradeability

Today, direct admin upgrades are enough for a small contributor project. As Trivela grows, we can
move to a stricter deployer pattern so contract IDs remain stable while upgrade authority is easier
to rotate and audit.

- **Deployer/Proxy admin contract**: route upgrades through a dedicated deployer contract (or a
  governance-controlled admin account) instead of a long-lived individual key.
- **Two-step rollout**: install new Wasm, run `upgrade`, then run `migrate` with explicit target
  versions and smoke checks between each step.
- **Migration ledgering**: persist migration checkpoints/events so off-chain monitors can verify
  exactly which schema version is live.
- **Rollback readiness**: keep previous Wasm hashes and migration runbooks ready to redeploy quickly
  if a release introduces regressions.

# Document changes you will make

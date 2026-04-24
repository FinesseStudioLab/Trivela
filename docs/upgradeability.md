# Soroban Contract Upgradeability & Migration

Trivela contracts keep state at stable contract IDs and evolve logic through Soroban Wasm upgrades.  
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

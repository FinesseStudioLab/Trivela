# Soroban Cheat Sheet — Host Functions, Arguments & Storage Keys

Quick-reference for the Soroban host functions Trivela contracts call, the arguments they take, and
the storage keys both contracts use. Jump links below work on GitHub.

## Contents

- [Host functions](#host-functions)
  - [Storage](#storage)
  - [Ledger & TTL](#ledger--ttl)
  - [Authorization](#authorization)
  - [Events & logging](#events--logging)
  - [Crypto & hashing](#crypto--hashing)
- [Trivela storage keys](#trivela-storage-keys)
  - [Rewards contract](#rewards-contract)
  - [Campaign contract](#campaign-contract)
  - [Composite / dynamic keys](#composite--dynamic-keys)
- [TTL constants](#ttl-constants)
- [See also](#see-also)

---

## Host functions

All functions below are methods on `Env` and are available inside every Soroban contract.

### Storage

| Host function                                                       | Arguments                                     | Returns     | Notes                                                          |
| ------------------------------------------------------------------- | --------------------------------------------- | ----------- | -------------------------------------------------------------- |
| `env.storage().instance().get(&key)`                                | `key: &Symbol` / `&BytesN` / custom `DataKey` | `Option<T>` | Instance storage — one entry set per contract                  |
| `env.storage().instance().set(&key, &val)`                          | `key`, `val: T`                               | `()`        | Writes instance storage                                        |
| `env.storage().instance().has(&key)`                                | `key`                                         | `bool`      | Membership check without deserializing                         |
| `env.storage().instance().extend_ttl(threshold, extend_to)`         | `threshold: u32`, `extend_to: u32`            | `()`        | Extend instance TTL (see [TTL constants](#ttl-constants))      |
| `env.storage().persistent().get(&key)`                              | `key`                                         | `Option<T>` | Persistent storage — survives across many ledgers, rent-paying |
| `env.storage().persistent().set(&key, &val)`                        | `key`, `val: T`                               | `()`        | Writes persistent storage                                      |
| `env.storage().persistent().has(&key)`                              | `key`                                         | `bool`      | Membership check                                               |
| `env.storage().persistent().extend_ttl(&key, threshold, extend_to)` | `key`, `threshold: u32`, `extend_to: u32`     | `()`        | Per-key TTL extension                                          |
| `env.storage().temporary().get(&key)`                               | `key`                                         | `Option<T>` | Temporary storage — expires quickly, cheapest rent             |
| `env.storage().temporary().set(&key, &val)`                         | `key`, `val: T`                               | `()`        | Writes temporary storage                                       |
| `env.storage().temporary().extend_ttl(&key, threshold, extend_to)`  | `key`, `threshold`, `extend_to`               | `()`        | Per-key TTL extension                                          |

### Ledger & TTL

| Host function                    | Arguments | Returns        | Notes                                           |
| -------------------------------- | --------- | -------------- | ----------------------------------------------- |
| `env.ledger().sequence_number()` | —         | `u32`          | Current ledger sequence                         |
| `env.ledger().timestamp()`       | —         | `u64`          | Unix timestamp of current ledger                |
| `env.ledger().budget()`          | —         | `Budget`       | CPU/memory budget remaining for this invocation |
| `env.ledger().cost_estimate()`   | —         | `CostEstimate` | Cost model inputs (protocol-dependent)          |

### Authorization

| Host function                          | Arguments         | Returns   | Notes                                                 |
| -------------------------------------- | ----------------- | --------- | ----------------------------------------------------- |
| `address.require_auth()`               | —                 | `()`      | Panics unless the address authorized the current call |
| `address.require_auth_for_args(&args)` | `args: &Vec<Val>` | `()`      | Auth scoped to a specific argument tuple              |
| `env.current_contract_address()`       | —                 | `Address` | Address of the executing contract                     |
| `address.to_string()` / `Display`      | —                 | `String`  | Human-readable `G…` / `C…` form                       |

### Events & logging

| Host function                            | Arguments                                          | Returns | Notes                                   |
| ---------------------------------------- | -------------------------------------------------- | ------- | --------------------------------------- |
| `env.events().publish(topics, data)`     | `topics: impl IntoVal<…>`, `data: impl IntoVal<…>` | `()`    | Emits a contract event on-chain         |
| `env.events().publish_new(topics, data)` | same                                               | `()`    | Alias used by some SDK versions         |
| `env.log(&msg)`                          | `msg: &str`                                        | `()`    | Debug log (test/dev only; not on-chain) |

### Crypto & hashing

| Host function                                  | Arguments                              | Returns      | Notes                   |
| ---------------------------------------------- | -------------------------------------- | ------------ | ----------------------- |
| `env.crypto().sha256(&bytes)`                  | `&Bytes`                               | `BytesN<32>` | SHA-256 digest          |
| `env.crypto().keccak256(&bytes)`               | `&Bytes`                               | `BytesN<32>` | Keccak-256 digest       |
| `env.crypto().ed25519_verify(&pk, &msg, &sig)` | `&BytesN<32>`, `&Bytes`, `&BytesN<64>` | `bool`       | Ed25519 signature check |

---

## Trivela storage keys

All keys are short `Symbol`s created with `symbol_short!` unless noted. They live in **instance**
storage.

### Rewards contract

Defined in [`contracts/rewards/src/lib.rs`](../contracts/rewards/src/lib.rs).

| Constant              | Key         | Type               | Purpose                           |
| --------------------- | ----------- | ------------------ | --------------------------------- |
| `ADMIN`               | `admin`     | `Address`          | Current contract admin            |
| `ADMIN_NONCE`         | `anonce`    | `i128`             | Replay guard for admin ops        |
| `ADMIN_PROPOSED`      | `aproposed` | `Address`          | Pending admin (two-step transfer) |
| `CLAIMED`             | `claimed`   | `u64`              | Cumulative claimed points         |
| `METADATA`            | `metadata`  | `(Symbol, Symbol)` | Token name + symbol               |
| `PAUSED`              | `paused`    | `bool`             | Circuit breaker                   |
| `MAX_CREDIT_PER_CALL` | `maxcrd`    | `u64`              | Per-call credit ceiling           |
| `RATE_LIM_MAX`        | `ratlmax`   | `u32`              | Credit rate-limit bucket size     |
| `RATE_LIM_WIN`        | `ratlwin`   | `u32`              | Rate-limit window in ledgers      |
| `RATE`                | `rate`      | `u32`              | Active credit rate                |
| `TTL_THRESHOLD`       | _(const)_   | `u32`              | `extend_ttl` threshold            |
| `TTL_EXTEND_TO`       | _(const)_   | `u32`              | `extend_ttl` target lifetime      |

### Campaign contract

Defined in [`contracts/campaign/src/lib.rs`](../contracts/campaign/src/lib.rs).

| Constant                  | Key             | Type                        | Purpose                     |
| ------------------------- | --------------- | --------------------------- | --------------------------- |
| `ADMIN`                   | `admin`         | `Address`                   | Campaign admin              |
| `ADMIN_NONCE`             | `anonce`        | `u64`                       | Replay guard for admin ops  |
| `CAMPAIGN_ACTIVE`         | `active`        | `bool`                      | Campaign open/closed flag   |
| `START_TIME` / `END_TIME` | `start` / `end` | `u64`                       | Registration window         |
| `MAX_CAP`                 | `maxcap`        | `u64`                       | Max participants            |
| `PARTICIPANT_COUNT`       | `count`         | `u64`                       | Registered participants     |
| `MERKLE_ROOT`             | `mkroot`        | `BytesN<32>`                | Allowlist Merkle root       |
| `SCHEMA_VERSION`          | `schema_v`      | `u32`                       | On-chain schema version     |
| `REFERRAL`                | `referral`      | `Address` (per participant) | Referrer attribution        |
| `REFERRAL_COUNT`          | `refcnt`        | `u64` (per referrer)        | Referral tally              |
| `ACTIVITY_LOG`            | `actlog`        | `Vec<ActivityEntry>`        | Recent activity ring buffer |
| `ACTIVITY_LOG_SIZE`       | `actsize`       | `u32`                       | Ring buffer size (10–200)   |

### Composite / dynamic keys

Some entries are keyed by a participant or rate-limit identity rather than a single short symbol:

| Key shape                   | Storage    | Purpose                              |
| --------------------------- | ---------- | ------------------------------------ |
| `(PARTICIPANT, address)`    | persistent | Per-participant registration flag    |
| `(REFERRAL, address)`       | persistent | `referrer_of(participant)`           |
| `(REFERRAL_COUNT, address)` | persistent | `referral_count(referrer)`           |
| `(rate_key, caller)`        | instance   | Per-caller credit rate-limit counter |

See [`docs/CONTRACTS_API.md`](./CONTRACTS_API.md) for the full key-value map and
[`docs/TTL_STRATEGY.md`](./TTL_STRATEGY.md) for rent management.

---

## TTL constants

| Constant        | Mainnet (`not(test)`) | Test (`cfg(test)`) | Meaning                                        |
| --------------- | --------------------- | ------------------ | ---------------------------------------------- |
| `TTL_THRESHOLD` | `100_000` (~6 days)   | `50`               | Extend when remaining life ≤ this many ledgers |
| `TTL_EXTEND_TO` | `518_400` (~30 days)  | `100`              | Target remaining lifetime after extension      |

Applied at every `extend_ttl` call site in both contracts. See
[`docs/TTL_STRATEGY.md`](./TTL_STRATEGY.md) for the rationale.

---

## See also

- [`docs/CONTRACTS_API.md`](./CONTRACTS_API.md) — full API reference
- [`docs/ARCHITECTURE_OVERVIEW.md`](./ARCHITECTURE_OVERVIEW.md) — system map
- [Soroban Host Functions reference](https://soroban.stellar.org/docs/reference/hosts)
- [Soroban Storage docs](https://soroban.stellar.org/docs/learn/transactions/storage)

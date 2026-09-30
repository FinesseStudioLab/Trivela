# Interactive Soroban Smart Contract Parameter Cheat Sheet

A comprehensive, developer-oriented reference mapping host functions, function signatures, argument types, authorization boundaries, storage key taxonomies, error codes, and TTL rent policies across all Trivela Soroban smart contracts.

---

## Table of Contents

- [1. Architectural Overview](#1-architectural-overview)
- [2. Quick Function & Storage Matrix](#2-quick-function--storage-matrix)
- [3. Campaign Contract (`contracts/campaign`)](#3-campaign-contract)
  - [3.1 Entrypoints & Parameters](#31-entrypoints--parameters)
  - [3.2 Storage Keys & Types](#32-storage-keys--types)
  - [3.3 Error Code Dictionary](#33-error-code-dictionary)
  - [3.4 Emitted Events](#34-emitted-events)
- [4. Rewards Contract (`contracts/rewards`)](#4-rewards-contract)
  - [4.1 Entrypoints & Parameters](#41-entrypoints--parameters)
  - [4.2 Storage Keys & Invariants](#42-storage-keys--invariants)
- [5. Badges Contract (`contracts/badges`)](#5-badges-contract)
  - [5.1 Soulbound & Non-Transferable Badges](#51-soulbound--non-transferable-badges)
  - [5.2 Storage Taxonomy](#52-storage-taxonomy)
- [6. Voting & Nullifiers Contracts (`contracts/voting`, `contracts/nullifiers`)](#6-voting--nullifiers-contracts)
  - [6.1 Quorum & Proposal Transitions](#61-quorum--proposal-transitions)
  - [6.2 Sybil Protection via Nullifier Hashes](#62-sybil-protection-via-nullifier-hashes)
- [7. Soroban Host Functions & Rent TTL Reference](#7-soroban-host-functions--rent-ttl-reference)

---

## 1. Architectural Overview

Trivela operates as a modular suite of Soroban smart contracts deployed to the Stellar network:

```
+-----------------------------------------------------------------------------------+
|                              Trivela Campaign Core                                |
|                                                                                   |
|  +--------------------+   +---------------------+   +--------------------------+  |
|  |  Campaign Contract |-->|   Rewards Contract  |-->|  Badges (Soulbound NFT)  |  |
|  |  (Allowlist/Merkle)|   |   (Escrow & Splits) |   |  (Tier Accomplishments)  |  |
|  +--------------------+   +---------------------+   +--------------------------+  |
|            |                         |                           |                |
|            v                         v                           v                |
|  +--------------------+   +---------------------+   +--------------------------+  |
|  |  Nullifiers Core   |   |   Voting Governance |   |  Snapshots & Auditing    |  |
|  |  (Sybil Guard)     |   |   (DAO Ballots)     |   |  (Ledger State Dumps)    |  |
|  +--------------------+   +---------------------+   +--------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 2. Quick Function & Storage Matrix

| Contract | Function Name | Required Auth | Storage Tier | Key Symbol / Format |
|---|---|---|---|---|
| `campaign` | `initialize` | `admin` | Instance | `Symbol("admin")` |
| `campaign` | `set_window` | `admin` | Instance | `Symbol("start")`, `Symbol("end")` |
| `campaign` | `set_active` | `admin` | Instance | `Symbol("active")` |
| `campaign` | `set_max_cap` | `admin` | Instance | `Symbol("maxcap")` |
| `campaign` | `set_merkle_root` | Co-admin multisig | Instance | `Symbol("mkroot")` |
| `campaign` | `register` | `participant` | Persistent | `(Symbol("partic"), Address)` |
| `campaign` | `prune_expired_participants`| Public | Persistent / Inst. | `Symbol("preg")`, `Symbol("pcursor")`|
| `rewards` | `distribute` | `distributor` | Persistent | `(Symbol("reward"), Address)` |
| `badges` | `mint` | `issuer` | Persistent | `(Symbol("badge"), u64, Address)` |
| `voting` | `cast_vote` | `voter` | Persistent / Temp | `(Symbol("vote"), u64, Address)` |
| `nullifiers`| `consume_nullifier` | Caller | Persistent | `(Symbol("nullif"), BytesN<32>)` |

---

## 3. Campaign Contract

### 3.1 Entrypoints & Parameters

#### `initialize(env: Env, admin: Address) -> Result<(), Error>`
- **Parameters:**
  - `admin: Address`: Initial administrator account receiving management permissions.
- **Auth:** `admin.require_auth()`
- **Storage Action:** Writes `ADMIN` in instance storage; initializes `ADMIN_NONCE = 0`, `PARTICIPANT_COUNT = 0`, `SCHEMA_VERSION = 1`.

#### `set_window(env: Env, admin: Address, nonce: u64, start: u64, end: u64) -> Result<(), Error>`
- **Parameters:**
  - `admin: Address`: Authorized admin.
  - `nonce: u64`: Replay protection counter (must equal stored `ADMIN_NONCE`).
  - `start: u64`: Unix timestamp of campaign start.
  - `end: u64`: Unix timestamp of campaign termination (`end > start`).
- **Auth:** `admin.require_auth()`
- **Errors:** `Error::Unauthorized`, `Error::InvalidAdminNonce`, `Error::InvalidWindow`.

#### `set_active(env: Env, admin: Address, nonce: u64, active: bool) -> Result<(), Error>`
- **Parameters:**
  - `admin: Address`: Authorized admin.
  - `nonce: u64`: Admin nonce.
  - `active: bool`: Boolean toggle to pause or unpause registrations.

#### `set_max_cap(env: Env, admin: Address, nonce: u64, max_cap: u64) -> Result<(), Error>`
- **Parameters:**
  - `max_cap: u64`: Maximum number of participants permitted.

#### `set_merkle_root(env: Env, admin: Address, nonce: u64, root: Option<BytesN<32>>, signatures: Vec<BytesN<64>>) -> Result<(), Error>`
- **Parameters:**
  - `root: Option<BytesN<32>>`: 32-byte Merkle root computed off-chain (`sha256(address_xdr_bytes)`). Pass `None` to disable allowlist restrictions.
  - `signatures: Vec<BytesN<64>>`: Ed25519 multisig signatures matching the co-admin threshold.

#### `register(env: Env, participant: Address, referrer: Option<Address>, leaf: Option<BytesN<32>>, proof: Option<Vec<BytesN<32>>>, invite_code: Option<Bytes>) -> Result<(), Error>`
- **Parameters:**
  - `participant: Address`: Wallet address of registrant.
  - `referrer: Option<Address>`: Optional referrer wallet (enforces anti-loop and anti-self-referral checks).
  - `leaf: Option<BytesN<32>>`: Precomputed allowlist leaf.
  - `proof: Option<Vec<BytesN<32>>>`: Sibling hashes verifying inclusion against active Merkle root.
  - `invite_code: Option<Bytes>`: Plaintext invite code checked against stored SHA-256 invite hashes when invite-only mode is active.
- **Auth:** `participant.require_auth()`

---

### 3.2 Storage Keys & Types

```rust
// Instance Storage Keys (Contract-wide state, bound to contract instance TTL)
ADMIN: Symbol = symbol_short!("admin");              // Value: Address
CAMPAIGN_ACTIVE: Symbol = symbol_short!("active");    // Value: bool
START_TIME: Symbol = symbol_short!("start");          // Value: u64
END_TIME: Symbol = symbol_short!("end");              // Value: u64
MAX_CAP: Symbol = symbol_short!("maxcap");            // Value: u64
PARTICIPANT_COUNT: Symbol = symbol_short!("count");   // Value: u64
MERKLE_ROOT: Symbol = symbol_short!("mkroot");        // Value: BytesN<32>
ADMIN_NONCE: Symbol = symbol_short!("anonce");        // Value: u64
SCHEMA_VERSION: Symbol = symbol_short!("schema_v");   // Value: u32

// Persistent Storage Keys (Individual actor records, independently bumped)
// Key: (PARTICIPANT, Address) -> Value: ParticipantRecord
// Key: (PARTICIPATED, Address) -> Value: bool (Permanent historical marker)
// Key: (NONCE_USED, u64)       -> Value: u32 (Ledger sequence when used)
```

---

### 3.3 Error Code Dictionary

| Code | Variant | Root Cause |
|---|---|---|
| `100` | `Unauthorized` | Caller does not match configured admin address. |
| `101` | `OutsideTimeWindow` | `env.ledger().timestamp()` is before `start` or after `end`. |
| `102` | `CapReached` | Total registered count equals or exceeds `max_cap`. |
| `103` | `CampaignInactive` | `set_active(false)` was triggered. |
| `104` | `NotInAllowlist` | Merkle proof verification failed for provided leaf. |
| `106` | `InvalidAdminNonce` | Admin nonce does not equal current sequence counter. |
| `107` | `InvalidWindow` | `end <= start` during window configuration. |
| `109` | `SelfReferral` | `referrer == participant`. |
| `110` | `ReferrerNotRegistered` | Specified referrer address has not registered. |
| `113` | `NullifierAlreadyUsed` | Double-registration prevention triggered on nullifier. |
| `114` | `InviteCodeRequired` | Invite-only mode is active and no code was provided. |
| `115` | `InvalidInviteCode` | Hash of invite code does not match issued unredeemed invite. |
| `120` | `NonceReused` | Multisig nonce was previously consumed. |
| `123` | `ReferralLoop` | Mutual referral loop detected (e.g. A refers B and B refers A). |

---

### 3.4 Emitted Events

All contract events follow the structured topic schema:

| Event Topic | Topic Arguments | Data Payload |
|---|---|---|
| `register` | `(Symbol("register"), participant: Address)` | `()` |
| `referred` | `(Symbol("referred"), participant: Address, referrer: Address)` | `()` |
| `active` | `(Symbol("active"),)` | `active: bool` |
| `window` | `(Symbol("window"),)` | `(start: u64, end: u64)` |
| `maxcap` | `(Symbol("maxcap"),)` | `max_cap: u64` |
| `merkle` | `(Symbol("merkle"),)` | `root: BytesN<32>` |
| `pruned` | `(Symbol("pruned"), kind: Symbol)` | `count: u32` |

---

## 4. Rewards Contract

The Rewards contract administers asset escrow and merit-based payouts.

### 4.1 Entrypoints & Parameters

- **`initialize(env: Env, admin: Address, token: Address)`**: Links payment token contract (USDC / native SAC).
- **`fund_pool(env: Env, funder: Address, amount: i128)`**: Transfers tokens into escrow using standard SEP-41 SAC `transfer_from`.
- **`claim_reward(env: Env, participant: Address, tier: u32, proof: Bytes)`**: Authorizes payout according to verified tiered milestones.

---

## 5. Badges Contract

Badges are implemented as Non-Transferable (Soulbound) Soroban assets to memorialize identity and reputation.

### 5.1 Soulbound & Non-Transferable Badges

- **Transfer restriction**: Any invocation of `transfer` or `transfer_from` by a holder traps with `Error::NonTransferableBadge`.
- **Revocation**: Admins retain emergency revocation capabilities for sybil cleanup.

---

## 6. Voting & Nullifiers Contracts

### 6.1 Quorum & Proposal Transitions

- `propose(env: Env, creator: Address, title: String, deadline: u64) -> u64`: Generates a unique proposal ID.
- `cast_vote(env: Env, voter: Address, proposal_id: u64, support: bool, nullifier: BytesN<32>)`: Enforces nullifier verification before registering ballot weight.

### 6.2 Sybil Protection via Nullifier Hashes

Nullifiers prevent double-voting across private ballots without revealing the identity of the voter on-chain. Each nullifier is stored in persistent storage:
`Key: (Symbol("nullif"), nullifier_hash: BytesN<32>) -> Value: bool`

---

## 7. Soroban Host Functions & Rent TTL Reference

Soroban smart contracts require explicit state lifecycle management to manage ledger bloat.

### Storage Hierarchy

| Storage Type | Survives Ledger Expiry? | Rent Cost | Best Used For |
|---|---|---|---|
| **Instance** | Extends with contract instance | Low | Global configuration, admin, nonces, total counters |
| **Persistent** | Survives with independent TTL | Medium | Participant records, balances, user credentials |
| **Temporary** | Cleared upon TTL expiration | Lowest | Nonces, ephemeral ballot commitments, cache keys |

### Production Rent TTL Invariants

Trivela production contracts enforce:

```rust
pub const TTL_THRESHOLD: u32 = 100_000; // ~5.7 days at 5s/ledger
pub const TTL_EXTEND_TO: u32 = 518_400; // ~30 days at 5s/ledger

// State bump pattern:
env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
```

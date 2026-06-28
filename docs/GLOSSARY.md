# Glossary — Stellar, Soroban & Trivela Terms

> A quick-reference for contributors new to Stellar/Soroban or the Trivela codebase. Entries are
> alphabetically sorted. Each entry includes a 2-3 sentence definition, how the term is used in
> Trivela, and a link for deeper reading.

---

### Account

A Stellar account is identified by a public key and holds balances of one or more assets. Accounts
must maintain a minimum XLM balance (the **base reserve**) to exist on-chain. In Trivela, accounts
represent campaign creators and donors interacting with the contracts.

→ [Stellar Accounts](https://developers.stellar.org/docs/learn/glossary#account)

---

### Admin Nonce

A monotonically increasing integer stored in the **Campaign contract** used to prevent replay
attacks on admin operations. Each privileged call (e.g. updating the Merkle root) must include the
current nonce; the contract increments it on success. In Trivela, `admin_nonce` is part of the
signed payload that authorises root updates.

---

### Anchor

A Stellar anchor is a business or entity that issues and redeems assets on the Stellar network (e.g.
USDC). Anchors bridge off-chain value (fiat, crypto) to on-chain Stellar assets via the SEP-24 /
SEP-31 protocols. Trivela campaigns accept assets issued by trusted anchors.

→ [Stellar Anchors](https://developers.stellar.org/docs/learn/glossary#anchor)

---

### Asset

A Stellar asset is any token issued on the network, identified by a `code:issuer` pair (e.g.
`USDC:GA5ZSEJ...`). The native asset is **XLM** (Lumens), which has no issuer. Trivela campaigns
specify an accepted asset; donors send that asset to the campaign contract.

→ [Stellar Assets](https://developers.stellar.org/docs/learn/glossary#asset)

---

### Base Fee

The minimum fee (in **stroops**) required for a Stellar transaction to be included in a ledger. The
base fee is dynamic and set by validators; callers should query the current fee before submitting.
Trivela's frontend uses Horizon's `/fee_stats` endpoint to set competitive fees.

→ [Transaction Fees](https://developers.stellar.org/docs/learn/glossary#base-fee)

---

### Campaign Contract

The primary Soroban smart contract in Trivela that holds campaign funds, enforces donation rules,
tracks donor balances, and distributes rewards. It stores a **Merkle allowlist** root and validates
donor proofs on every claim call.

---

### Contract ID

A unique 32-byte identifier assigned to a deployed Soroban contract, encoded as a Stellar strkey
(`C...`). The contract ID is derived from the deployer address and a salt; it never changes after
deployment. Trivela stores contract IDs in `.env` files and in the frontend config for each network.

→
[Soroban Contract IDs](https://developers.stellar.org/docs/learn/encyclopedia/contract-development/storage-and-data)

---

### Freighter

A browser extension wallet for Stellar that signs transactions without exposing the secret key to
web pages. Freighter is the primary wallet supported by Trivela's frontend; the UI uses
`@stellar/freighter-api` to request signatures. Users must have Freighter installed to interact with
Trivela campaigns in the browser.

→ [Freighter](https://www.freighter.app/)

---

### Friendbot

A testnet-only faucet service that funds a Stellar address with 10,000 XLM for development and
testing. Friendbot is **not** available on Mainnet; production accounts must be funded through
exchanges or anchors. Trivela's `GETTING_STARTED.md` uses Friendbot to set up local dev accounts.

→ [Friendbot](https://developers.stellar.org/docs/learn/glossary#friendbot)

---

### Horizon

The RESTful API server for the Stellar network, providing endpoints for accounts, transactions,
ledgers, and more. Horizon indexes Stellar Core data and exposes it over HTTP; the JS SDK
(`@stellar/stellar-sdk`) wraps it. Trivela's backend uses Horizon to watch for incoming payments and
confirm transaction status.

→ [Horizon API](https://developers.stellar.org/docs/data/horizon)

---

### Instance Storage

A Soroban storage tier that persists data for the lifetime of the contract instance. Data in
instance storage is cheaper to access than **persistent storage** but is deleted if the contract
instance expires and is not extended. Trivela contracts use instance storage for configuration
values such as the admin address and asset code.

→
[Soroban Storage](https://developers.stellar.org/docs/learn/encyclopedia/contract-development/storage-and-data)

---

### Ledger

A Stellar ledger is a snapshot of the network state (all accounts, balances, and contract data) at a
specific sequence number. A new ledger closes approximately every 5 seconds. Trivela uses ledger
sequence numbers for TTL calculations and expiry checks on Soroban storage entries.

→ [Stellar Ledger](https://developers.stellar.org/docs/learn/glossary#ledger)

---

### Ledger Sequence

The monotonically increasing integer identifying each ledger. Smart contracts use the current ledger
sequence (via `env.ledger().sequence()`) for timestamping and TTL-based expiry. Trivela's campaign
contracts record the ledger sequence at campaign creation for audit purposes.

---

### Mainnet

The Stellar production network where real assets and real XLM are transacted. The Mainnet network
passphrase is `Public Global Stellar Network ; September 2015`. Trivela's production deployment
targets Mainnet; never use Friendbot or testnet addresses here.

---

### Merkle Allowlist

A Merkle-tree-based access control mechanism where only addresses whose leaf hash is provable
against a stored root can claim rewards. The campaign admin publishes a root hash; donors submit a
Merkle proof along with their claim. Trivela's **Campaign contract** stores the current Merkle root
and verifies proofs on-chain.

---

### Campaign Multiplier

A configurable reward multiplier stored in the Campaign contract that scales the reward amount per
donation unit. For example, a multiplier of `2` doubles the reward tokens paid out relative to the
donated amount. The admin can update the multiplier between campaign phases via a signed admin call.

---

### Network Passphrase

A human-readable string that uniquely identifies a Stellar network and is included in every
transaction hash to prevent cross-network replay. Testnet passphrase:
`Test SDF Network ; September 2015`. Mainnet: `Public Global Stellar Network ; September 2015`.
Trivela's SDK initialisation always requires the correct passphrase for the target network.

→ [Network Passphrase](https://developers.stellar.org/docs/learn/glossary#network-passphrase)

---

### Persistent Storage

The highest-durability Soroban storage tier; data survives as long as the rent (TTL) is extended.
More expensive to read/write than **instance storage** or **temporary storage**, but safe for
long-lived state. Trivela contracts use persistent storage for per-donor balances and campaign
totals.

→
[Soroban Storage](https://developers.stellar.org/docs/learn/encyclopedia/contract-development/storage-and-data)

---

### Rewards Contract

A companion Soroban contract in Trivela responsible for minting and distributing reward tokens to
eligible donors. It reads verified claim data from the **Campaign contract** and transfers reward
tokens accordingly. The Rewards contract address is registered in the Campaign contract at
initialisation.

---

### Schema Version

An integer stored in Trivela's contract state that tracks breaking changes to the data layout. When
a migration is needed, the schema version is incremented and an upgrade function runs the data
migration. Trivela's `upgradeability.md` documents the schema version history.

---

### Sequence Number

A per-account counter on Stellar that must increment by exactly 1 with each submitted transaction,
preventing replay. If a transaction is submitted with the wrong sequence number it is rejected.
Trivela's backend manages sequence numbers carefully when batching multi-step transactions.

→ [Sequence Number](https://developers.stellar.org/docs/learn/glossary#sequence-number)

---

### Soroban

Stellar's smart-contract platform, built on WebAssembly (Wasm) and the Rust SDK. Soroban contracts
run in a deterministic, metered environment with explicit storage tiers and host-function costs. All
of Trivela's on-chain logic lives in Soroban contracts under `contracts/`.

→ [Soroban Docs](https://developers.stellar.org/docs/build/smart-contracts)

---

### Soroban RPC

The JSON-RPC endpoint that allows clients to simulate and submit Soroban transactions, query
contract state, and stream events. Soroban RPC is separate from Horizon; the default testnet
endpoint is `https://soroban-testnet.stellar.org`. Trivela's contract interaction scripts
(`scripts/`) target Soroban RPC directly.

→ [Soroban RPC](https://developers.stellar.org/docs/data/rpc)

---

### Temporary Storage

The lowest-cost, shortest-lived Soroban storage tier; data expires at the end of the TTL (as few as
16 ledgers by default). Used for ephemeral values such as oracle prices or nonces that are only
needed for one transaction. Trivela does not currently use temporary storage, but it is available
for future optimisations.

→
[Soroban Storage](https://developers.stellar.org/docs/learn/encyclopedia/contract-development/storage-and-data)

---

### Testnet

Stellar's public test network, a mirror of Mainnet behaviour but with no real value. The Testnet
network passphrase is `Test SDF Network ; September 2015`; accounts can be funded via **Friendbot**.
Trivela's CI and staging deployments run on Testnet.

---

### Trustline

A Stellar account must explicitly opt in to hold a non-native asset by establishing a trustline to
its issuer. Without a trustline, an account cannot receive that asset. Trivela's onboarding flow
checks for the required trustline before allowing a donation.

→ [Trustlines](https://developers.stellar.org/docs/learn/glossary#trustline)

---

### TTL (Time-to-Live)

The number of ledgers remaining before a Soroban storage entry (or contract instance) expires and is
deleted. TTL can be extended by calling `extend_instance_ttl` or `extend_persistent_ttl` host
functions. Trivela contracts call TTL extension on every write to ensure long-lived state never
unexpectedly expires.

→
[Soroban TTL](https://developers.stellar.org/docs/learn/encyclopedia/contract-development/storage-and-data#ttl)

---

### WASM / WebAssembly

The binary instruction format that Soroban smart contracts compile to before deployment. WASM
binaries are uploaded to the Stellar ledger and referenced by contract IDs. Trivela builds contract
WASM with `cargo build --target wasm32-unknown-unknown --release`.

→ [WebAssembly](https://webassembly.org/)

---

### XDR (External Data Representation)

The binary serialisation format used by Stellar for all on-chain data structures (transactions,
ledger entries, results). XDR schemas are versioned and published by the Stellar Development
Foundation. Trivela's backend deserialises XDR event data from Horizon/Soroban RPC to parse contract
events.

→ [Stellar XDR](https://developers.stellar.org/docs/learn/glossary#xdr)

---

_See also: [Architecture Overview](ARCHITECTURE_OVERVIEW.md) · [Contributing](../CONTRIBUTING.md) ·
[Stellar Glossary](https://developers.stellar.org/docs/learn/glossary)_

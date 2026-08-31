# Trivela Contract Event Schema

Every event emitted by the `RewardsContract` is listed here. The indexer in
`backend/src/jobs/eventIndexer.js` must parse every entry in this table; the parity test in
`backend/src/jobs/eventIndexer.parity.test.js` asserts that each event type is handled.

## Format

Soroban events have the shape:

```
topics: [Symbol, ...args]
data:   ScVal
```

The first topic is the event discriminant (short symbol). Topic and data types are expressed as
Soroban XDR types.

---

## Events Reference

| Event key           | Topics                                            | Data                                       | Emitted by                                                        |
| ------------------- | ------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `credit`            | `(credit, user: Address)`                         | `amount: u64`                              | `credit`, `credit_for_campaign`, `batch_credit`, `credit_by_rank` |
| `claim`             | `(claim, user: Address)`                          | `amount: u64`                              | `claim`                                                           |
| `transfer`          | `(transfer, from: Address, to: Address)`          | `amount: u64`                              | `admin_transfer`                                                  |
| `paused`            | `(paused,)`                                       | `is_paused: bool`                          | `set_paused`                                                      |
| `pscredit`          | `(pscredit,)`                                     | `is_paused: bool`                          | `set_paused_credit`                                               |
| `psclaim`           | `(psclaim,)`                                      | `is_paused: bool`                          | `set_paused_claim`                                                |
| `psredeem`          | `(psredeem,)`                                     | `is_paused: bool`                          | `set_paused_redeem`                                               |
| `mxcredit`          | `(mxcredit,)`                                     | `max_amount: u64`                          | `set_max_credit_per_call`                                         |
| `multset`           | `(multset, campaign_id: u64)`                     | `multiplier_bps: u32`                      | `set_campaign_multiplier`                                         |
| `ratlset`           | `(ratlset,)`                                      | `(max_calls: u32, window_ledgers: u32)`    | `set_credit_rate_limit`                                           |
| `snapshot`          | `(snapshot, snapshot_id: u64)`                    | `ledger: u32`                              | `snapshot`                                                        |
| `pruned`            | `(pruned,)`                                       | `count: u32`                               | `prune_nonces`                                                    |
| `vcredit`           | `(vcredit, user: Address)`                        | `(vest_id: u64, total: u64)`               | `credit_vested`                                                   |
| `vclaim`            | `(vclaim, user: Address)`                         | `(vest_id: u64, amount: u64)`              | `claim_vested`                                                    |
| `redeem`            | `(redeem, user: Address)`                         | `(points_burned: u64, asset_amount: i128)` | `redeem`                                                          |
| `refcfg`            | `(refcfg,)`                                       | `(rate_bps: u32, per_referrer_cap: u64)`   | `set_referral_config`                                             |
| `refbonus`          | `(refbonus, referrer: Address, referee: Address)` | `(bonus: u64, qualifying_amount: u64)`     | `pay_referral_bonus`                                              |
| `aproposed`         | `(aproposed, new_admin: Address)`                 | `(proposed_by: Address)`                   | `propose_admin`                                                   |
| `aaccepted`         | `(aaccepted, new_admin: Address)`                 | `(prev_admin: Address)`                    | `accept_admin`                                                    |
| `transfer` (SEP-41) | `(transfer, from: Address, to: Address)`          | `amount: i128`                             | `transfer` (token mode)                                           |
| `approve` (SEP-41)  | `(approve, from: Address, spender: Address)`      | `(amount: i128, expiration_ledger: u32)`   | `approve` (token mode)                                            |
| `burn` (SEP-41)     | `(burn, from: Address)`                           | `amount: i128`                             | `burn` (token mode)                                               |

---

## Indexer Handler Coverage

The following event keys have projection handlers in `eventIndexer.js`:

| Key                       | Handler function                                | DB effect                                       |
| ------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| `credit`                  | `handleCreditEvent`                             | Updates `user_points.balance`                   |
| `claim`                   | `handleClaimEvent`                              | Decrements `user_points.balance`, records claim |
| `snapshot`                | `handleSnapshotEvent`                           | Inserts into `snapshots`                        |
| `vcredit`                 | `handleVestedCreditEvent`                       | Inserts into `vesting_schedules`                |
| `vclaim`                  | `handleVestedClaimEvent`                        | Updates `vesting_schedules.claimed`             |
| `referred` / `refbonus`   | `handleReferredEvent` / `handleRefBonusEvent`   | Updates referral tables                         |
| `register` / `deregister` | `handleRegisterEvent` / `handleDeregisterEvent` | Updates campaign participants                   |

Events without a projection handler (`paused`, `mxcredit`, `ratlset`, etc.) are still stored in
`indexed_events` for audit purposes; they do not mutate derived state tables.

---

## On-chain / Off-chain Parity Rules

1. Every `credit` event **must** increase the off-chain `user_points.balance` by the exact `amount`
   in the event data.
2. Every `claim` event **must** decrease the off-chain `user_points.balance` by the exact `amount`.
3. The sum of all `credit` events minus the sum of all `claim` events for a user **must** equal the
   current on-chain `balance(user)`.
4. Every `snapshot` event ledger **must** match the `ledger` field stored in the `snapshots` table
   row for that `snapshot_id`.
5. No event may be processed twice (idempotency via `UNIQUE(tx_hash, event_index)`).
6. **GDPR / data retention (#927).** The Stellar/Soroban ledger is public and permanently immutable
   — this backend has no ability to delete, redact, or alter a wallet's on-chain transaction
   history, including `credit`/`claim`/`refbonus` events already emitted. The master-key-gated
   `POST /api/v1/pii/purge-user` endpoint (`backend/src/services/piiPurgeService.js`, `PII_TABLES`)
   only erases this backend's **off-chain copies** of that data — the projection tables listed above
   (`participants`, `credit_events`, `claim_events`, `balances`, `vesting_schedules`,
   `vested_claim_events`, `referral_credits`) plus `referrals` and the
   notification/preference/push-subscription tables. If the indexer's checkpoint
   (`indexer_checkpoints`, migration 020) is ever reset and a fresh instance re-indexes from an
   early ledger, `eventIndexer.js` will recreate those projection rows for the purged wallet from
   on-chain history — erasure is **not** permanent against a future full re-index, and this caveat
   should be disclosed to anyone processing an erasure request. `POST /api/v1/pii/export-user`
   (`exportPiiForUser`) covers the same table set for GDPR "right of access" requests.

   Organization-staff PII (`organization_members`/`organization_invitations`, keyed by email rather
   than wallet address) is a separate identity axis — org team members managing campaigns, not
   rewards-platform participants — but is included in `PII_TABLES` since the purge/export
   `identifier` accepts either a wallet address or an email.

   `analytics_events` is handled separately: `validateEvent()` in `analyticsService.js` already
   rejects wallet/email/IP fields at write time, and `purgePiiForUser` additionally scans and
   redacts any matching value found in stored event `properties` as a defensive backstop.

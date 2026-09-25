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

## Event logging standard (#1196)

All workspace contracts (`RewardsContract`, `CampaignContract`, `NullifierRegistry`) follow one
convention so off-chain indexers can subscribe with a single topic filter per event and decode
payloads without contract-specific special cases:

1. **Topics are a tuple.** `topics = (EVENT, key_1, …, key_n)`; `data` is the payload (a single
   value, a tuple, or `()` when there is nothing beyond the topics).
2. **`topic[0]` is the event discriminant**, a `Symbol` of at most 9 characters declared once as
   a `*_EVENT` constant with `symbol_short!` — never built inline at the call site. Indexers
   filter on this first topic.
3. **Indexed keys go in topics; amounts and settings go in data.** Put the entities an indexer
   looks events up by (user / participant / operator `Address`, `campaign_id`, proposal or
   snapshot id) in topics, in that order of importance; put quantities, flags and configuration
   values in `data`.
4. **Names are stable.** An emitted event's discriminant, topic order and data shape are part of
   the public interface: never rename or reorder them. Evolve by adding a new event (or a new
   trailing data field behind a new discriminant) instead.
5. **Every publish site is catalogued below.** The catalog is generated from the source; CI fails
   when it is stale or when a new event breaks rules 1–2.

Four discriminants built inline before this standard (`tier_credit`, `set_tiers`, `clear_tiers`,
`deregister`) are grandfathered — indexers already depend on them — but no new inline names are
accepted.

Tooling:

```bash
node scripts/check-contract-events.mjs          # lint + verify the catalog (runs in Contracts CI)
node scripts/check-contract-events.mjs --write  # regenerate the catalog after changing an event
```

### Generated event catalog

The tables below list **every** `env.events().publish(...)` site in the workspace contracts, with
the topics and data exactly as written in the source. They supersede the hand-maintained
`RewardsContract` table above wherever the two differ.

<!-- BEGIN GENERATED EVENT CATALOG (scripts/check-contract-events.mjs --write) -->

### RewardsContract (`contracts/rewards/src/lib.rs`)

| Event (`topic[0]`) | Const | Indexed topics | Data | Emitted in |
| --- | --- | --- | --- | --- |
| `aaccepted` | `ADMIN_ACCEPTED_EVENT` | — | `new_admin` | `accept_admin()` |
| `airreclm` | `AIRDROP_CLAIMED_EVENT` | `claimer` | `amount` | `claim_airdrop()` |
| `approve` | `SEP41_APPROVE_EVENT` | `from`, `spender` | `amount` | `sep41_approve()` |
| `aproposed` | `ADMIN_PROPOSED_EVENT` | `current_admin` | `new_admin` | `propose_admin()` |
| `ast_add` | `ASSET_ADD_EVENT` | — | `(asset, rate_bps)` | `add_redemption_asset()` |
| `ast_rem` | `ASSET_REMOVE_EVENT` | — | `asset` | `remove_redemption_asset()` |
| `ast_upd` | `ASSET_UPDATE_EVENT` | — | `(asset, rate_bps)` | `update_redemption_asset()` |
| `boostcrve` | `BOOST_CURVE_EVENT` | — | `()` | `set_boost_curve()` |
| `burn` | `SEP41_BURN_EVENT` | `from` | `amount` | `sep41_burn()` |
| `burn` | `SEP41_BURN_EVENT` | `from` | `amount` | `sep41_burn_from()` |
| `campcap` | `CAMPAIGN_CAP_EVENT` | `campaign_id` | `cap` | `set_campaign_supply_cap()` |
| `claim` | `CLAIM_EVENT` | `user` | `amount` | `claim()` |
| `claim` | `CLAIM_EVENT` | `user` | `amount` | `claim_with_cooldown()` |
| `clear_tiers` | `(inline, legacy)` | `campaign_id` | `()` | `clear_tiers()` |
| `clwbcanc` | `CLAWBACK_CANCEL_EVENT` | `proposal_id` | `()` | `cancel_clawback()` |
| `clwbexec` | `CLAWBACK_EXECUTE_EVENT` | `proposal_id` | `(proposal.target, proposal.amount)` | `execute_clawback()` |
| `clwbprop` | `CLAWBACK_PROPOSE_EVENT` | `id` | `(target, amount)` | `propose_clawback()` |
| `cool_set` | `COOLDOWN_SET_EVENT` | `campaign_id` | `cooldown_ledgers` | `set_claim_cooldown()` |
| `credit` | `CREDIT_EVENT` | `user` | `amount` | `batch_credit()` |
| `credit` | `CREDIT_EVENT` | `user` | `amount` | `credit()` |
| `credit` | `CREDIT_EVENT` | `user` | `amount` | `credit_as_operator()` |
| `credit` | `CREDIT_EVENT` | `referrer` | `bonus` | `pay_multi_level_referral_bonus()` |
| `credit` | `CREDIT_EVENT` | `referrer` | `bonus` | `pay_referral_bonus()` |
| `distmset` | `DIST_MODE_SET_EVENT` | `campaign_id` | `mode` | `set_distribution_mode()` |
| `govcanc` | `GOV_CANCEL_EVENT` | `admin` | `proposal_id` | `cancel_param_change()` |
| `govexec` | `GOV_EXECUTE_EVENT` | `admin` | `(proposal_id, proposal.param_key, proposal.new_value)` | `execute_param_change()` |
| `govprp` | `GOV_PROPOSE_EVENT` | `proposer` | `(id, param_key, new_value)` | `propose_param_change()` |
| `govvote` | `GOV_VOTE_EVENT` | `voter` | `(proposal_id, vote_count)` | `vote_param_change()` |
| `locksched` | `LOCK_SCHEDULE_EVENT` | — | `()` | `set_lock_schedules()` |
| `minclmst` | `MIN_CLAIM_EVENT` | — | `min_amount` | `set_min_claim()` |
| `multset` | `CAMPAIGN_MULTIPLIER_EVENT` | `campaign_id` | `multiplier_bps` | `set_campaign_multiplier()` |
| `mxcredit` | `MAX_CREDIT_EVENT` | — | `max_amount` | `set_max_credit_per_call()` |
| `opcredit` | `OP_CREDIT_EVENT` | `operator`, `user` | `amount` | `credit_as_operator()` |
| `opgrant` | `OP_GRANT_EVENT` | `operator`, `campaign_id` | `budget` | `grant_operator()` |
| `oprevoke` | `OP_REVOKE_EVENT` | `operator`, `campaign_id` | `()` | `revoke_operator()` |
| `paused` | `PAUSED_EVENT` | — | `paused` | `set_paused()` |
| `privappr` | `PRIV_APPR_EVENT` | `signer` | `(proposal_id, approval_count)` | `approve_privileged_op()` |
| `privexec` | `PRIV_EXEC_EVENT` | `executor` | `(proposal_id, approval_count)` | `execute_privileged_op()` |
| `privprop` | `PRIV_PROP_EVENT` | `proposer` | `(id, op)` | `propose_privileged_op()` |
| `pruned` | `PRUNED_EVENT` | `symbol_short!("nonce")` | `pruned` | `prune_used_nonces()` |
| `psclaim` | `PAUSE_CLAIM_EVENT` | — | `paused` | `set_paused_claim()` |
| `pscredit` | `PAUSE_CREDIT_EVENT` | — | `paused` | `set_paused_credit()` |
| `pscredit` | `PAUSE_CREDIT_EVENT` | — | `paused` | `set_paused_stake()` |
| `psredeem` | `PAUSE_REDEEM_EVENT` | — | `paused` | `set_paused_redeem()` |
| `ratlset` | `RATE_LIM_SET_EVENT` | — | `(max_calls, window_ledgers)` | `set_credit_rate_limit()` |
| `rd_ma` | `REDEEM_MULTIASSET_EVENT` | `user`, `target_asset` | `(points_amount, asset_amount)` | `redeem_to_asset()` |
| `redeem` | `REDEEM_EVENT` | `user` | `(points_amount, asset_amount)` | `redeem()` |
| `refbonus` | `REF_BONUS_EVENT` | `referrer`, `referee` | `(bonus, qualifying_amount)` | `pay_referral_bonus()` |
| `refcfg` | `REF_CONFIG_EVENT` | — | `(depth, tier_rates)` | `set_multi_level_referral_config()` |
| `refcfg` | `REF_CONFIG_EVENT` | — | `(rate_bps, per_referrer_cap)` | `set_referral_config()` |
| `refmlvl` | `REF_MULTILEVEL_EVENT` | `referrer`, `current_referee`, `level` | `(bonus, qualifying_amount)` | `pay_multi_level_referral_bonus()` |
| `set_tiers` | `(inline, legacy)` | `campaign_id` | `()` | `set_tiers()` |
| `snapshot` | `SNAPSHOT_EVENT` | `snapshot_id` | `ledger_number` | `snapshot()` |
| `stake` | `STAKE_EVENT` | `user` | `(stake_id, amount, unlocks_at, boost_multiplier_bps)` | `stake()` |
| `tier_credit` | `(inline, legacy)` | `user` | `(rank, points)` | `credit_by_rank()` |
| `tlcanc` | `TIMELOCK_CANCEL_EVENT` | `admin` | `op_hash` | `cancel_timelock()` |
| `tlexec` | `TIMELOCK_EXEC_EVENT` | `admin`, `op_hash` | `eta_ledger` | `execute_timelock()` |
| `tlqueue` | `TIMELOCK_QUEUE_EVENT` | `admin`, `op_hash` | `eta_ledger` | `queue_timelock()` |
| `transfer` | `TRANSFER_EVENT` | `from`, `to` | `amount` | `admin_transfer()` |
| `transfer` | `SEP41_TRANSFER_EVENT` | `from`, `to` | `amount` | `sep41_transfer()` |
| `transfer` | `SEP41_TRANSFER_EVENT` | `from`, `to` | `amount` | `sep41_transfer_from()` |
| `unstake` | `UNSTAKE_EVENT` | `user` | `(stake_id, to_claim, updated_position.claimed)` | `unstake()` |
| `vclaim` | `VESTED_CLAIM_EVENT` | `user` | `(vest_id, amount)` | `claim_vested()` |
| `vcredit` | `VESTED_CREDIT_EVENT` | `user` | `(vest_id, total_amount)` | `credit_vested()` |

### CampaignContract (`contracts/campaign/src/lib.rs`)

| Event (`topic[0]`) | Const | Indexed topics | Data | Emitted in |
| --- | --- | --- | --- | --- |
| `aaccepted` | `ADMIN_ACCEPTED_EVENT` | — | `new_admin` | `accept_admin()` |
| `active` | `SET_ACTIVE_EVENT` | — | `active` | `set_active()` |
| `allowen` | `SET_ALLOWLIST_ENABLED_EVENT` | — | `enabled` | `set_allowlist_enabled()` |
| `allowset` | `SET_ALLOWLIST_EVENT` | — | `addresses` | `add_to_allowlist()` |
| `allowset` | `SET_ALLOWLIST_EVENT` | — | `addresses` | `remove_from_allowlist()` |
| `aproposed` | `ADMIN_PROPOSED_EVENT` | `current_admin` | `new_admin` | `propose_admin()` |
| `blocken` | `SET_BLOCKLIST_ENABLED_EVENT` | — | `enabled` | `set_blocklist_enabled()` |
| `blockset` | `SET_BLOCKLIST_EVENT` | — | `addresses` | `add_to_blocklist()` |
| `blockset` | `SET_BLOCKLIST_EVENT` | — | `addresses` | `remove_from_blocklist()` |
| `deregister` | `(inline, legacy)` | `participant` | `()` | `do_deregister()` |
| `invite` | `ISSUE_INVITE_EVENT` | — | `invite_hash` | `issue_invite()` |
| `invonly` | `SET_INVITE_ONLY_EVENT` | — | `enabled` | `set_invite_only()` |
| `invrevk` | `REVOKE_INVITE_EVENT` | — | `invite_hash` | `revoke_invite()` |
| `ldg_win` | `SET_LEDGER_WINDOW_EVENT` | — | `(start_ledger, end_ledger)` | `set_ledger_window()` |
| `maxcap` | `SET_MAX_CAP_EVENT` | — | `max_cap` | `set_max_cap()` |
| `merkle` | `SET_MERKLE_ROOT_EVENT` | — | `root` | `set_merkle_root()` |
| `privmode` | `SET_PRIVACY_MODE_EVENT` | — | `(mode as u32, fallback_allowed)` | `set_privacy_mode()` |
| `pruned` | `PRUNED_EVENT` | `symbol_short!("partic")` | `pruned` | `prune_expired_participants()` |
| `pruned` | `PRUNED_EVENT` | `symbol_short!("nonce")` | `pruned` | `prune_used_nonces()` |
| `referred` | `REFERRED_EVENT` | `participant`, `referrer` | `()` | `do_register()` |
| `register` | `REGISTER_EVENT` | `participant` | `()` | `do_register()` |
| `scdmode` | `SET_SCHEDULE_MODE_EVENT` | — | `mode as u32` | `set_schedule_mode()` |
| `unqset` | `SET_UNIQUENESS_EVENT` | — | `mode as u32` | `set_uniqueness_mode()` |
| `window` | `SET_WINDOW_EVENT` | — | `(start, end)` | `set_window()` |

### NullifierRegistry (`contracts/nullifiers/src/lib.rs`)

| Event (`topic[0]`) | Const | Indexed topics | Data | Emitted in |
| --- | --- | --- | --- | --- |
| `spent` | `SPENT_EVENT` | `consumer` | `nullifier` | `spend()` |

<!-- END GENERATED EVENT CATALOG -->

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

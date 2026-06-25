# On-chain Referral Rewards

Part of the **Viral growth engine** epic
([#656](https://github.com/FinesseStudioLab/Trivela/issues/656)). This document covers the
**on-chain referral reward** slice — the `#603` "referral economy" portion of the epic.

## Scope

| Epic task                                                 | Status in this PR                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| On-chain referral bonus payout + anti-abuse + attribution | ✅ Implemented (rewards contract + indexer hook)                               |
| Quest / streak engine                                     | ⏭️ Follow-up                                                                   |
| Recurring / seasonal scheduler                            | ⏭️ Follow-up                                                                   |
| Seasonal leaderboards (reset + archive)                   | ⏭️ Follow-up                                                                   |
| Growth instrumentation                                    | ◐ Referral-conversion instrumentation included; quest/season metrics follow-up |

The epic is intentionally large (`difficulty: hard`, `effort: L`) and consolidates four features.
This PR lands the foundational, self-contained referral piece end-to-end so it can be reviewed and
merged independently; the remaining features build on top of it.

## Design overview

Referral handling is split across the two existing contracts by responsibility:

- **Campaign contract** owns _attribution_: who referred whom. It already records
  `referrer_of(participant)` and `referral_count(referrer)` at registration time, and emits a
  `referred` event.
- **Rewards contract** owns _payout_ and the anti-abuse invariants. This PR adds an on-chain
  referral reward engine here, next to the existing balance/credit logic.

The platform backend decides _when_ a referee has completed a qualifying action (off-chain business
logic) and then calls `pay_referral_bonus` on the rewards contract as the configured admin. The
contract is the source of truth for the abuse invariants, so a buggy or compromised caller still
cannot double-pay, self-refer, create cycles, or exceed caps.

```
referee completes qualifying action
        │
        ▼
backend (admin) ── pay_referral_bonus(referrer, referee, qualifying_amount) ──▶ rewards contract
                                                                                    │  enforces invariants,
                                                                                    │  credits referrer
                                                                                    ▼
                                                          emits `credit` + `ref_bonus` events
                                                                                    │
                                                                                    ▼
                                                   event indexer ── balances (credit) + referral_bonus_events (metrics)
```

## Contract API (rewards contract)

| Function                                                                   | Auth  | Description                                                                                                                                          |
| -------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set_referral_config(admin, rate_bps, per_referrer_cap)`                   | admin | Configure bonus rate (basis points of the qualifying amount) and the per-referrer cumulative cap (`0` = uncapped). `rate_bps` must be `1..=100_000`. |
| `referral_config() -> (rate_bps, per_referrer_cap)`                        | view  | Current configuration; `(0, 0)` until set.                                                                                                           |
| `pay_referral_bonus(admin, referrer, referee, qualifying_amount) -> bonus` | admin | Pay the referrer their bonus for a referee's qualifying action; returns the credited bonus.                                                          |
| `referral_bonus_total(referrer) -> u64`                                    | view  | Cumulative referral bonus credited to a referrer.                                                                                                    |
| `referral_reward_count(referrer) -> u64`                                   | view  | Number of distinct referees a referrer has been rewarded for.                                                                                        |
| `rewarded_referrer_of(referee) -> Option<Address>`                         | view  | The referrer rewarded for a given referee, if any.                                                                                                   |

`bonus = qualifying_amount * rate_bps / 10_000` (floor division). All arithmetic is checked (`u128`
intermediate) and overflow returns `Error::Overflow`.

## Anti-abuse invariants (enforced on-chain)

| Threat                         | Guard                                                                                         | Error                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Self-referral                  | `referrer == referee` rejected.                                                               | `SelfReferral`                            |
| Circular referral (A→B, B→A)   | Rejected when the referrer was itself previously rewarded as a referee of this referee.       | `CircularReferral`                        |
| Sybil farming / replay         | Each referee can trigger **at most one** bonus, ever (one-bonus-per-referee uniqueness gate). | `ReferralAlreadyRewarded`                 |
| Unbounded referrer earnings    | Per-referrer cumulative cap (`0` = uncapped).                                                 | `ReferralCapExceeded`                     |
| Dust / zero payouts            | A bonus that floors to `0` is rejected (keeps payouts all-or-nothing).                        | `ZeroReferralBonus`                       |
| Unconfigured / paused contract | Payout requires a configured non-zero rate and a non-paused contract.                         | `ReferralNotConfigured`, `ContractPaused` |

Capped, self, circular, replay, and zero-bonus attempts are **all-or-nothing**: they return an error
and write no state (no balance change, no counter increment, no attribution record).

## Events

- `ref_config` — topics `(refcfg,)`, data `(rate_bps: u32, per_referrer_cap: u64)`
- `ref_bonus` — topics `(refbonus, referrer, referee)`, data `(bonus: u64, qualifying_amount: u64)`

Each successful payout also emits the standard `credit` event for the referrer so existing balance
indexers stay consistent.

## Backend instrumentation

The event indexer ([`backend/src/jobs/eventIndexer.js`](../backend/src/jobs/eventIndexer.js)) gains
a `refbonus` handler that persists each attribution edge to the new `referral_bonus_events` table
(migration `010`). Because the paired `credit` event already updates balances, this handler records
**instrumentation only** (referrer, referee, bonus, qualifying amount) — never balances — so there
is no double-counting. The `UNIQUE(referee)` constraint mirrors the on-chain one-bonus-per-referee
invariant and makes re-indexing idempotent.

This unlocks referral-conversion metrics, e.g.:

```sql
-- Top referrers by reward volume
SELECT referrer, COUNT(*) AS conversions, SUM(CAST(bonus AS INTEGER)) AS total_bonus
FROM referral_bonus_events
GROUP BY referrer
ORDER BY total_bonus DESC;
```

## Tests

- **Contract** (`contracts/rewards/src/test.rs`): 13 new tests covering config validation + admin
  gating, the happy-path payout, event emission, and each anti-abuse invariant (self, circular,
  replay/idempotency, cap, zero-bonus, paused, unauthorized).
- **Backend** (`backend/src/jobs/eventIndexer.test.js`): the `refbonus` handler records the metrics
  row, never mutates balances, and ignores malformed events.

Run them with:

```bash
cargo test -p trivela-rewards-contract
npm run test:backend
```

## Follow-ups (rest of the epic)

1. Quest / streak engine feeding reputation/badges.
2. Recurring / seasonal campaign scheduler (locked, idempotent config cloning).
3. Seasonal leaderboards with reset + immutable archive over indexed rollups.
4. Quest-completion and season-retention growth metrics.

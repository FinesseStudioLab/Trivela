# Rewards Contract

The Trivela rewards contract tracks user balances and claimed totals on Soroban.

## Events

- `credit` Topics: `(credit, user)` Data: credited `amount` as `u64`
- `claim` Topics: `(claim, user)` Data: claimed `amount` as `u64`

These events are emitted by the `credit` and `claim` contract functions so indexers and off-chain
services can track reward balance changes.

## Minimum claim amount

To prevent spam via many tiny claim transactions (each one costs a fee on mainnet), the admin can
set a minimum amount that a single `claim()` call must move:

- `set_min_claim(admin, min_amount)` — admin only. `0` disables the minimum (the default).
- `min_claim()` — returns the currently configured minimum (`0` if unset).
- `claim(user, amount)` returns `Error::BelowMinClaim` if `amount < min_claim` while a nonzero
  minimum is configured. A claim exactly equal to the minimum succeeds.
- Emits a `min_claim_set` event (data: the new minimum) whenever the admin changes it.

# Rewards Contract

The Trivela rewards contract tracks user balances and claimed totals on Soroban.

## Events

- `credit` Topics: `(credit, user)` Data: credited `amount` as `u64`
- `claim` Topics: `(claim, user)` Data: claimed `amount` as `u64`

These events are emitted by the `credit` and `claim` contract functions so indexers and off-chain
services can track reward balance changes.

# Security Caps & Merkle-based Claims

## Summary
This PR combines two major smart contract epics to improve both security and distribution scaling without hitting gas or storage constraints.

## Changes

### 1. Redemption Caps & Circuit Breaker (#723)
- **Per-Account Redemption Cap:** Added a daily limit (configurable) that prevents a single account from redeeming an excessive amount of funds.
- **Global Circuit Breaker:** Introduced a global redemption window limit. If aggregate redemptions across all users exceed this cap within the window, the circuit breaker trips.
- **Auto-Pause:** When the global circuit breaker trips, it automatically sets `redeem_paused` to true, stopping all further redemptions until an admin manually intervenes and unpauses.
- **Events & Errors:** Added `CircuitBreakerTripped` event, along with typed errors `PerAccountCapExceeded` and `GlobalCapExceeded`.

### 2. Merkle-based bulk crediting (#897)
- **Admin Root Publishing:** Admins can now publish a single Merkle Root representing the distribution list (user, amount) using `set_merkle_root`.
- **User Claiming (O(log n)):** Users provide their Merkle proof to the `claim_merkle` function. The contract verifies the proof against the stored root, ensuring that users can only claim their exact allocation.
- **Double-Claim Prevention:** Added a tracking mechanism mapping each successfully claimed leaf hash to a boolean to prevent double-claiming.
- **Gas Costs Shifted:** The gas cost of crediting is now correctly shifted to the end-users claiming the reward, keeping admin overhead minimal and scalable to millions of users.

## Verification
- Deployed locally and tested that exceeding per-account limit returns `Error::PerAccountCapExceeded`.
- Tested the global circuit breaker threshold triggering an auto-pause of the contract.
- Added a full suite of Rust tests with locally generated Merkle trees to verify valid and invalid proofs.
- Attempting to claim twice with the same valid proof properly reverts with `Error::AlreadyClaimed`.

## Closes
Closes #723
Closes #897

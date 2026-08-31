# Security: Per-account and global daily redemption caps & circuit breaker

## Summary
This PR addresses critical security gaps in the redemption flow by adding volume-based rate limiting to protect the contract reserve from being drained.

## Changes
- **Per-Account Redemption Cap:** Added a daily limit (configurable) that prevents a single account from redeeming an excessive amount of funds.
- **Global Circuit Breaker:** Introduced a global redemption window limit. If aggregate redemptions across all users exceed this cap within the window, the circuit breaker trips.
- **Auto-Pause:** When the global circuit breaker trips, it automatically sets `redeem_paused` to true, stopping all further redemptions until an admin manually intervenes and unpauses.
- **Events & Errors:** Added `CircuitBreakerTripped` event, along with typed errors `PerAccountCapExceeded` and `GlobalCapExceeded`.
- **Admin Configuration:** Admins can adjust the limits dynamically via the `set_redeem_caps` function.

## Verification
- Deployed locally and tested that exceeding per-account limit returns `Error::PerAccountCapExceeded`.
- Tested the global circuit breaker threshold triggering an auto-pause of the contract.
- Added comprehensive unit tests and fuzzing for the rolling time window boundary conditions.

## Closes
Closes #723

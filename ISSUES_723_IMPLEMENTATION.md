# Implementation Summary for Issue 723

This document summarizes the changes introduced to implement per-account and global daily redemption caps, along with a circuit breaker, in the Soroban smart contracts.

## 1. Per-Account Redemption Cap
- **Implementation**: We added a tracking mechanism `AccountRedeemVolume(Address, WindowId)` to store the total amount redeemed by each user in a given time window.
- **Verification**: The `redeem` function now checks this volume against `PER_ACCOUNT_REDEEM_CAP`. If exceeded, it reverts with `Error::PerAccountCapExceeded`.

## 2. Global Circuit Breaker
- **Implementation**: We track aggregate system-wide redemptions using `GlobalRedeemVolume(WindowId)`. 
- **Verification**: If a transaction pushes the global volume over `GLOBAL_REDEEM_CAP`, the contract emits a `CircuitBreakerTripped` event, sets the contract state `redeem_paused` to true, and reverts with `Error::GlobalCapExceeded`. 
- **Resolution**: Only an admin can invoke `unpause_redeem` to resume operations after an investigation.

## 3. Dynamic Configuration
- Added the `set_redeem_caps` function, which allows admins to update the global cap, the per-account cap, and the window duration dynamically without requiring a contract upgrade.

## Security Considerations
These changes heavily mitigate the risk of coordinated extraction attacks, limiting the maximum exposure of the contract reserves in any given time window.

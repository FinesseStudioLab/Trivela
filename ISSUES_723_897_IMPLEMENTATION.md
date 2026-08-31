# Implementation Summary for Issues 723 and 897

This document summarizes the changes introduced to implement per-account and global daily redemption caps, along with a circuit breaker, as well as Merkle-based bulk crediting for gas-efficient mass distribution in Soroban smart contracts.

## 1. Per-Account Redemption Cap (#723)
- **Implementation**: We added a tracking mechanism `AccountRedeemVolume(Address, WindowId)` to store the total amount redeemed by each user in a given time window.
- **Verification**: The `redeem` function now checks this volume against `PER_ACCOUNT_REDEEM_CAP`. If exceeded, it reverts with `Error::PerAccountCapExceeded`.

## 2. Global Circuit Breaker (#723)
- **Implementation**: We track aggregate system-wide redemptions using `GlobalRedeemVolume(WindowId)`. 
- **Verification**: If a transaction pushes the global volume over `GLOBAL_REDEEM_CAP`, the contract emits a `CircuitBreakerTripped` event, sets the contract state `redeem_paused` to true, and reverts with `Error::GlobalCapExceeded`. 
- **Resolution**: Only an admin can invoke `unpause_redeem` to resume operations after an investigation.

## 3. Merkle Verification Logic (#897)
- **Implementation**: Created a dedicated module `contracts/rewards/src/merkle.rs` containing a highly optimized `verify_proof` function. 
- **O(log n) Verification**: The logic loops through the `proof` array (size `log n`), hashing the current node with the adjacent node based on lexical ordering. 
- **Gas Efficiency**: Shifts the state-writing gas cost from the admin (who previously had to write balances for thousands of users in loops) to individual claimants.

## 4. Claim Tracking (#897)
- **Double Claims**: To prevent users from reusing a valid proof to claim repeatedly, we store the hash of the successfully claimed leaf: `ClaimedLeaf(leaf_hash)`.
- **Validation**: On each `claim_merkle` invocation, the contract checks this map. If it returns true, the transaction safely reverts with `Error::AlreadyClaimed`.

## Security Considerations
These changes heavily mitigate the risk of coordinated extraction attacks, limiting the maximum exposure of the contract reserves in any given time window, and securely scales crediting distribution to millions of participants.

# Reentrancy Analysis: SAC Token Transfers

## Executive Summary

This document analyzes the reentrancy safety of all functions in the Trivela rewards contract that make external SAC (Stellar Asset Contract) token transfers. All three critical functions—`redeem`, `withdraw_reserve`, and `fund_reserve`—follow the **Checks-Effects-Interactions (CEI)** pattern, ensuring that state updates occur before external calls.

## Background: Reentrancy Risk

Reentrancy occurs when an external contract call transfers control back to the calling contract before the original function completes. If state isn't updated before the external call, the reentrant invocation sees stale data and can exploit race conditions (e.g., withdraw the same funds twice).

### Attack Vector
A malicious SAC token contract could implement a `transfer` function that:
1. Receives the transfer call from the rewards contract
2. Calls back into the rewards contract (reenters)
3. Attempts to exploit any inconsistent state

### Defense: Checks-Effects-Interactions (CEI)

The CEI pattern mandates:
1. **Checks**: Validate all preconditions (balances, authorization, etc.)
2. **Effects**: Update all state variables (balances, reserves, counters)
3. **Interactions**: Make external contract calls

By updating state before external calls, any reentrant call sees the post-update state, preventing double-spends and race conditions.

## Function-by-Function Analysis

### 1. `redeem` Function

**Location**: `contracts/rewards/src/lib.rs:1416`

**Purpose**: Burn user points and transfer asset tokens from the contract's reserve to the user.

**External Call**: `token_client.transfer(&env.current_contract_address(), &user, &asset_amount)`

#### CEI Ordering

##### Checks (Lines 1417-1460)
```rust
user.require_auth();                           // Authorization check
ensure_redeem_not_paused(&env)?;              // Feature flag check
// ... fetch config ...
if asset_amount > available_reserve {         // Reserve sufficiency check
    return Err(Error::InsufficientReserve);
}
```

##### Effects (Lines 1461-1489)
```rust
// 1. Burn points from user balance
env.storage().instance().set(&balance_key, &new_balance);

// 2. Deduct from total supply
env.storage().instance().set(&TOTAL_SUPPLY, &supply.saturating_sub(points_amount));

// 3. Update redemption reserve BEFORE transfer
let new_reserve = (current_reserve as i128).saturating_sub(asset_amount) as u64;
env.storage().instance().set(&REDEMPTION_RESERVE, &new_reserve);
```

##### Interactions (Line 1491)
```rust
// External call happens AFTER all state updates
token_client.transfer(&env.current_contract_address(), &user, &asset_amount);
```

#### Reentrancy Safety Analysis

**Scenario**: Malicious token calls `redeem` again during transfer

**Result**: Safe because:
1. User's point balance already decremented → second call fails with `InsufficientBalance`
2. Reserve already decremented → second call sees reduced reserve
3. Total supply already updated → conservation invariant maintained

**Proof**: See `test_redeem_reentrancy_safe` and `test_redeem_prevents_double_withdrawal_on_reentry` in `contracts/rewards/src/reentrancy_tests.rs`

---

### 2. `withdraw_reserve` Function

**Location**: `contracts/rewards/src/lib.rs:1505`

**Purpose**: Admin-only function to withdraw asset tokens from the redemption reserve.

**External Call**: `token_client.transfer(&env.current_contract_address(), &admin, &(amount as i128))`

#### CEI Ordering

##### Checks (Lines 1509-1523)
```rust
require_admin_with_nonce(&env, &admin, nonce)?;  // Authorization + nonce check
// ... fetch config ...
if amount > current_reserve {                     // Reserve sufficiency check
    return Err(Error::InsufficientReserve);
}
```

##### Effects (Lines 1525-1528)
```rust
// Update reserve BEFORE external call
let new_reserve = current_reserve.saturating_sub(amount);
env.storage().instance().set(&REDEMPTION_RESERVE, &new_reserve);
```

##### Interactions (Lines 1530-1532)
```rust
// External call happens AFTER state update
use soroban_sdk::token;
let token_client = token::Client::new(&env, &asset_address);
token_client.transfer(&env.current_contract_address(), &admin, &(amount as i128));
```

#### Reentrancy Safety Analysis

**Scenario**: Malicious token calls `withdraw_reserve` again during transfer

**Result**: Safe because:
1. Reserve already decremented → second call sees reduced reserve
2. Nonce already consumed → second call with same nonce fails
3. If attacker tries new nonce, reserve limit still enforced

**Additional Protection**: Admin nonce prevents replay attacks even without reentrancy.

**Proof**: See `test_withdraw_reserve_reentrancy_safe` and `test_withdrawal_bounded_by_reserve_after_state_update` in `contracts/rewards/src/reentrancy_tests.rs`

---

### 3. `fund_reserve` Function

**Location**: `contracts/rewards/src/lib.rs:1551`

**Purpose**: Transfer asset tokens from caller to the contract's redemption reserve.

**External Call**: `token_client.transfer(&from, env.current_contract_address(), &(amount as i128))`

#### CEI Ordering

##### Checks (Lines 1552-1557)
```rust
from.require_auth();                              // Authorization check
// ... fetch config ...
```

##### Effects (Lines 1559-1566)
```rust
// Update reserve BEFORE external call (explicitly documented in code)
let current_reserve: u64 = env.storage().instance().get(&REDEMPTION_RESERVE).unwrap_or(0);
let new_reserve = current_reserve.checked_add(amount).ok_or(Error::Overflow)?;
env.storage().instance().set(&REDEMPTION_RESERVE, &new_reserve);
```

**Code Comment** (Lines 1545-1549):
```rust
// Checks-effects-interactions (issue #850): the reserve balance is
// written *before* the external SAC `transfer` call, matching `redeem`
// and `withdraw_reserve`. If `asset_address` were ever a hostile
// contract that reenters during `transfer`, the reentrant call would
// see the reserve already incremented rather than a stale value it
// could exploit a race on.
```

##### Interactions (Lines 1568-1570)
```rust
// External call happens AFTER state update
use soroban_sdk::token;
let token_client = token::Client::new(&env, &asset_address);
token_client.transfer(&from, env.current_contract_address(), &(amount as i128));
```

#### Reentrancy Safety Analysis

**Scenario**: Malicious token calls `fund_reserve` again during transfer

**Result**: Safe because:
1. Reserve already incremented → second call sees higher reserve (not exploitable)
2. Transfer is FROM caller TO contract → attacker would need to authorize funds again
3. `from.require_auth()` prevents unauthorized funding even on reentry

**Note**: Unlike withdrawal scenarios, incrementing reserve on reentry isn't harmful (attacker would be funding the contract with their own tokens).

**Proof**: See `test_fund_reserve_reentrancy_safe` in `contracts/rewards/src/reentrancy_tests.rs`

---

## Conservation Invariants

### Point Supply Conservation
- **Invariant**: `total_supply == Σ(all user balances)`
- **Maintained by**: `redeem` updates both user balance and total supply atomically before external call
- **Reentrancy Impact**: None—both updates complete before transfer

### Reserve Conservation
- **Invariant**: `REDEMPTION_RESERVE <= actual SAC token balance`
- **Maintained by**: All functions update reserve before transfer
- **Reentrancy Impact**: None—reserve updates are atomic and precede transfers

## Test Coverage

### Reentrancy Test Suite
Location: `contracts/rewards/src/reentrancy_tests.rs`

#### Tests Implemented

1. **`test_redeem_reentrancy_safe`**
   - Verifies `redeem` with malicious token
   - Confirms balance and reserve updated correctly
   - Proves no double-spend possible

2. **`test_withdraw_reserve_reentrancy_safe`**
   - Verifies `withdraw_reserve` with malicious token
   - Confirms reserve decremented only once
   - Proves admin withdrawal safe from reentrancy

3. **`test_fund_reserve_reentrancy_safe`**
   - Verifies `fund_reserve` with malicious token
   - Confirms reserve incremented correctly
   - Proves funding mechanism safe

4. **`test_redeem_prevents_double_withdrawal_on_reentry`**
   - Explicit double-redemption attempt
   - Confirms second redemption fails due to insufficient balance
   - Proves state consistency maintained

5. **`test_withdrawal_bounded_by_reserve_after_state_update`**
   - Tests sequential withdrawals
   - Confirms each withdrawal sees updated reserve
   - Proves no race condition on reserve

### Malicious Token Implementation

The test suite includes `MaliciousToken`, a mock SAC token that:
- Attempts to reenter the rewards contract during `transfer`
- Tracks reentrancy attempts for verification
- Simulates realistic attack scenarios

### Running the Tests

```bash
# Run all reentrancy tests
cd contracts/rewards
cargo test reentrancy

# Run with verbose output
cargo test reentrancy -- --nocapture

# Run specific test
cargo test test_redeem_reentrancy_safe
```

Expected output: All tests pass, demonstrating CEI pattern prevents reentrancy exploits.

## Security Guarantees

### What is Protected

✅ **Double-redemption**: User cannot redeem points twice via reentrancy  
✅ **Double-withdrawal**: Admin cannot withdraw reserve funds twice  
✅ **Balance manipulation**: Point balances cannot be inflated via reentrant calls  
✅ **Reserve manipulation**: Reserve counter remains consistent with actual transfers  
✅ **Supply conservation**: Total supply equals sum of user balances at all times  

### Assumptions

1. **Soroban Host Environment**: We assume Soroban's execution model prevents unbounded recursion (stack overflow protection)
2. **Authorization Model**: We assume `require_auth()` correctly enforces caller authentication
3. **Storage Atomicity**: We assume storage operations within a single invocation are atomic

### Known Limitations

1. **Read-only reentrancy**: Malicious token could read (but not modify) state during transfer. This is not exploitable with current contract design but should be considered in future extensions.

2. **Cross-contract reentrancy**: If future contracts interact with the rewards contract, they must also follow CEI patterns.

3. **External balance drift**: The contract compares `REDEMPTION_RESERVE` with actual token balance in `redeem` (issue #834). If the token balance can be manipulated externally (e.g., via direct `transfer_from` calls bypassing `fund_reserve`), the reserve counter could drift. The `min()` operation bounds payout by the smaller value as a defense.

## Audit Checklist

For security auditors:

- [x] All external token transfers identified
- [x] CEI pattern verified for each function
- [x] State updates confirmed to precede external calls
- [x] Reentrancy tests implemented with hostile token mock
- [x] Tests pass demonstrating exploit prevention
- [x] Conservation invariants documented
- [x] Code comments explain CEI ordering (inline at issue #850 references)
- [x] Authorization checks precede all state changes
- [x] Nonce handling prevents replay attacks in admin functions

## Conclusion

All three functions that perform SAC token transfers (`redeem`, `withdraw_reserve`, `fund_reserve`) correctly implement the Checks-Effects-Interactions pattern. State updates occur before external calls in all cases, preventing reentrancy exploits.

The comprehensive test suite with a malicious token mock verifies that:
1. Reentrant calls see updated (post-modification) state
2. Double-spending is prevented
3. Conservation invariants hold across reentrancy attempts

The explicit code comments (referencing issue #850) document the CEI guarantee for maintainers and auditors.

---

**Document Version**: 1.0  
**Last Updated**: August 2026  
**Review Date**: February 2027  
**Owner**: Trivela Security Team  
**Related Issue**: #850

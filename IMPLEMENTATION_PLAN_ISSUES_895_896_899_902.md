# Implementation Plan: Issues #895, #896, #899, #902

## Overview

This document outlines the implementation plan for four advanced contract features as part of the
Trivela mainnet-readiness roadmap. All four issues fall under the "Advanced Contract Features" epic
and focus on campaign management, reward redemption, and access control.

## Issues Summary

### Issue #895: Delegated / Scoped Crediting Permissions for Campaign Operators

**Epic**: Advanced Contract Features  
**Priority**: Medium  
**Labels**: area: contracts, type: feature

**Description**: Allow admin to grant operators permission to credit points only within a specific
campaign and budget.

**Problem**: Large deployments need many operators crediting points without holding the master admin
key. Scoped, budgeted delegation makes this safe.

**Acceptance Criteria**:

- Operators can credit only within their scope + budget
- Budget depletes and blocks over-spend
- Revocation is immediate

---

### Issue #896: Multi-Asset Redemption

**Epic**: Advanced Contract Features  
**Priority**: Medium  
**Labels**: area: contracts, financial-safety, type: feature

**Description**: Allow campaigns to configure more than one redemption asset with independent rates
and reserves.

**Problem**: Real programs reward in different assets (USDC, XLM, project token). A single
redemption asset is limiting.

**Acceptance Criteria**:

- Multiple assets configurable with per-asset rate + reserve
- Redeem specifies the target asset
- Reserve accounting is per-asset and reconciled

---

### Issue #899: Reward Claim Cooldown / Minimum-Interval Enforcement

**Epic**: Advanced Contract Features  
**Priority**: Low  
**Labels**: area: contracts, type: feature

**Description**: Optionally enforce a per-user cooldown between claims to deter automated draining.

**Problem**: Some campaigns need to throttle claim frequency; a cooldown complements the existing
rate limiter.

**Acceptance Criteria**:

- Cooldown configurable per campaign
- Claims within cooldown revert with a typed error
- Tested across ledger boundaries

---

### Issue #902: Scheduled / Automated Campaign Activation Windows

**Epic**: Advanced Contract Features  
**Priority**: Low  
**Labels**: area: contracts, type: feature

**Description**: Support campaigns that auto-activate and auto-close at configured ledger sequences.

**Problem**: Operators want set-and-forget campaign windows without manual toggling.

**Acceptance Criteria**:

- Campaigns respect start/end ledgers automatically
- Actions outside the window revert
- Tested around boundaries

---

## Technical Analysis

### Current Architecture

Based on codebase analysis:

1. **Campaign Contract** (`contracts/campaign/src/lib.rs`):
   - Manages campaign metadata and participant registration
   - Already has time window support (`set_window`, `get_window`, `is_within_window`)
   - Includes co-admin multisig functionality
   - Uses TTL-managed storage for participant records

2. **Rewards Contract** (`contracts/rewards/src/lib.rs`):
   - Handles point crediting, claiming, and redemption
   - Currently supports single-asset redemption
   - Has rate limiting, vesting, and multi-level referral features
   - Includes pause mechanisms and admin controls

### Proposed Implementation Strategy

#### Issue #895: Delegated Crediting Permissions

**Contracts Affected**: `contracts/rewards/src/lib.rs`

**New Data Structures**:

```rust
/// Operator delegation configuration
#[contracttype]
pub struct OperatorDelegation {
    pub operator: Address,
    pub campaign_id: u64,
    pub budget_total: u64,
    pub budget_used: u64,
    pub granted_at: u32,
    pub revoked: bool,
}
```

**Storage Keys**:

- `OPERATOR_DELEGATION: Symbol = symbol_short!("opdlgt")`
- `OPERATOR_REGISTRY: Symbol = symbol_short!("opreg")`

**New Functions**:

- `grant_operator(admin, nonce, operator, campaign_id, budget)` - Admin grants permission
- `revoke_operator(admin, nonce, operator, campaign_id)` - Admin revokes permission
- `credit_as_operator(operator, campaign_id, user, amount)` - Operator credits within scope
- `get_operator_delegation(operator, campaign_id)` - View delegation status
- `list_operators(campaign_id)` - View all operators for campaign

**Modifications**:

- Add budget checking to credit functions
- Event emission for delegation lifecycle

---

#### Issue #896: Multi-Asset Redemption

**Contracts Affected**: `contracts/rewards/src/lib.rs`

**New Data Structures**:

```rust
/// Per-asset redemption configuration
#[contracttype]
pub struct RedemptionAssetConfig {
    pub asset_address: Address,
    pub rate_bps: u64,          // Points per asset unit (basis points)
    pub reserve_balance: i128,
    pub enabled: bool,
}
```

**Storage Keys**:

- `REDEMPTION_ASSETS: Symbol = symbol_short!("rd_assts")` - Vec of asset addresses
- `ASSET_CONFIG: Symbol = symbol_short!("ast_cfg")` - (ASSET_CONFIG, Address) ->
  RedemptionAssetConfig

**New Functions**:

- `add_redemption_asset(admin, nonce, asset, rate_bps, initial_reserve)` - Configure new asset
- `update_redemption_asset(admin, nonce, asset, rate_bps)` - Modify rate
- `remove_redemption_asset(admin, nonce, asset)` - Disable asset
- `redeem_to_asset(user, points_amount, target_asset)` - Redeem to specific asset
- `get_redemption_assets()` - List all configured assets
- `get_asset_config(asset)` - Get specific asset config

**Modifications**:

- Extend existing `redeem` function to default to primary asset
- Per-asset reserve tracking and reconciliation
- Updated events to include asset address

---

#### Issue #899: Claim Cooldown

**Contracts Affected**: `contracts/rewards/src/lib.rs`

**New Data Structures**:

```rust
/// Per-campaign claim cooldown configuration
#[contracttype]
pub struct ClaimCooldown {
    pub cooldown_ledgers: u32,  // Minimum ledgers between claims
    pub enabled: bool,
}
```

**Storage Keys**:

- `CLAIM_COOLDOWN: Symbol = symbol_short!("clm_cool")` - (CLAIM_COOLDOWN, campaign_id) ->
  ClaimCooldown
- `LAST_CLAIM_LEDGER: Symbol = symbol_short!("lst_clm")` - (LAST_CLAIM_LEDGER, user, campaign_id) ->
  u32

**New Error**:

```rust
ClaimCooldownActive = 57,
```

**New Functions**:

- `set_claim_cooldown(admin, nonce, campaign_id, cooldown_ledgers)` - Configure cooldown
- `get_claim_cooldown(campaign_id)` - View cooldown config
- `get_user_last_claim(user, campaign_id)` - Check last claim time
- `can_claim_now(user, campaign_id)` - View cooldown status

**Modifications**:

- Add cooldown check to `claim` and related functions
- Store ledger sequence on successful claims
- Event emission with cooldown status

---

#### Issue #902: Scheduled Campaign Activation

**Contracts Affected**: `contracts/campaign/src/lib.rs`

**Note**: The campaign contract ALREADY implements time window functionality:

- `set_window(admin, nonce, start, end)` - Sets activation window
- `get_window()` - Returns (start, end) tuple
- `is_within_window()` - Checks if current time is within window
- Window enforcement in `register` function

**Enhancement Needed**: Extend to work with **ledger sequences** in addition to timestamps.

**New Data Structures**:

```rust
/// Campaign activation schedule mode
#[contracttype]
pub enum ScheduleMode {
    Timestamp = 0,  // Existing: uses env.ledger().timestamp()
    Ledger = 1,     // New: uses env.ledger().sequence()
}
```

**Storage Keys**:

- `SCHEDULE_MODE: Symbol = symbol_short!("scdmode")` - Per-campaign schedule mode
- `START_LEDGER: Symbol = symbol_short!("strtldg")` - Start ledger sequence
- `END_LEDGER: Symbol = symbol_short!("endldg")` - End ledger sequence

**New Functions**:

- `set_ledger_window(admin, nonce, start_ledger, end_ledger)` - Set ledger-based window
- `get_ledger_window()` - Get ledger-based window
- `is_within_ledger_window()` - Check ledger-based window
- `set_schedule_mode(admin, nonce, mode)` - Toggle between timestamp/ledger mode

**Modifications**:

- Update activation checks to respect schedule mode
- Boundary testing for ledger transitions
- Event emission for schedule changes

---

## Implementation Approach

### Phase 1: Core Data Structures & Storage

1. Define all new `contracttype` structs
2. Add storage keys and constants
3. Define new error variants

### Phase 2: Admin Configuration Functions

1. Implement setter functions for each feature
2. Add getter/view functions
3. Ensure proper admin authentication and nonce handling

### Phase 3: Core Business Logic

1. Operator budget tracking and enforcement (#895)
2. Multi-asset redemption logic (#896)
3. Cooldown enforcement (#899)
4. Ledger-based activation (#902)

### Phase 4: Integration & Testing

1. Add integration tests for each feature
2. Boundary condition testing
3. Multi-feature interaction testing
4. Event emission verification

### Phase 5: Documentation

1. Update contract documentation
2. Add usage examples
3. Update contract spec JSON if applicable

---

## Testing Strategy

### Unit Tests

- Budget depletion and over-spend protection (#895)
- Multi-asset rate calculation and reserve accounting (#896)
- Cooldown enforcement across ledger boundaries (#899)
- Ledger-based window boundaries (#902)

### Integration Tests

- Operator permissions with campaign multipliers
- Multi-asset redemption with different rates
- Cooldown interaction with rate limits
- Scheduled activation with participant registration

### Edge Cases

- Zero budgets, rates, or cooldowns
- Concurrent operator credits
- Asset reserve exhaustion
- Ledger boundary conditions (start/end transitions)

---

## Migration & Compatibility

### Storage Schema

- All new features use additive storage patterns
- No breaking changes to existing functions
- Backward compatible with deployed contracts

### Upgrade Path

1. Deploy updated WASM via `upgrade` function
2. Admin configures new features as needed
3. Existing functionality continues unaffected

---

## Security Considerations

### Issue #895 (Operators)

- **Access Control**: Operators can only credit within granted scope
- **Budget Enforcement**: Hard limits prevent over-crediting
- **Revocation**: Immediate effect, no grace period
- **Audit Trail**: All delegations logged via events

### Issue #896 (Multi-Asset)

- **Reserve Protection**: Per-asset accounting prevents cross-contamination
- **Rate Validation**: Bounds checking on rate configuration
- **Asset Isolation**: Failed redemption on one asset doesn't affect others

### Issue #899 (Cooldown)

- **DoS Prevention**: Prevents rapid automated claiming
- **Storage Efficiency**: Minimal per-user storage overhead
- **Bypass Prevention**: Cooldown enforced before balance checks

### Issue #902 (Scheduling)

- **Time Integrity**: Uses immutable ledger sequence
- **Boundary Safety**: Inclusive/exclusive range handling
- **Predictability**: Deterministic activation based on blockchain state

---

## Performance Impact

### Storage Costs

- **#895**: O(1) per operator delegation + registry entry
- **#896**: O(n) where n = number of redemption assets (expected < 10)
- **#899**: O(1) per user per campaign
- **#902**: O(1) additional storage (ledger window fields)

### Computation Costs

- All checks are O(1) or O(log n) lookups
- No unbounded loops or recursion
- Minimal gas overhead per feature

---

## Success Metrics

### Functional Requirements Met

- ✅ Operators can credit within budget (#895)
- ✅ Multiple redemption assets supported (#896)
- ✅ Claim cooldown prevents rapid draining (#899)
- ✅ Campaigns auto-activate/close (#902)

### Non-Functional Requirements

- No breaking changes to existing contracts
- All tests pass
- Events emitted for auditability
- Documentation updated

---

## Timeline Estimate

- **Phase 1**: Data structures - 2 hours
- **Phase 2**: Admin functions - 4 hours
- **Phase 3**: Business logic - 6 hours
- **Phase 4**: Testing - 4 hours
- **Phase 5**: Documentation - 2 hours

**Total Estimated Time**: 18 hours of focused development

---

## Open Questions

1. **#895**: Should operator budgets be refillable, or one-time grants?
   - **Proposal**: Make `grant_operator` additive (can be called multiple times)

2. **#896**: Should there be a maximum number of redemption assets?
   - **Proposal**: Soft limit of 10 assets to prevent excessive gas costs

3. **#899**: Should cooldown apply per-campaign or globally per-user?
   - **Proposal**: Per-campaign for flexibility (as specified)

4. **#902**: Should ledger-based and timestamp-based windows coexist?
   - **Proposal**: Support both modes with a toggle (schedule mode)

---

## References

- Campaign Contract: `contracts/campaign/src/lib.rs`
- Rewards Contract: `contracts/rewards/src/lib.rs`
- Existing TTL Strategy: `docs/TTL_STRATEGY.md` (referenced in contracts)
- Mainnet Readiness Roadmap: Issue epic "Advanced Contract Features"

---

## Conclusion

This implementation plan provides a comprehensive approach to delivering four critical
mainnet-readiness features. Each feature is designed to be:

- **Modular**: Independent implementation with minimal cross-dependencies
- **Safe**: Robust access control and validation
- **Efficient**: Minimal storage and computation overhead
- **Extensible**: Foundation for future enhancements

The plan prioritizes backward compatibility and security while providing powerful new capabilities
for campaign operators and users.

---

**Status**: Ready for review and implementation  
**Created**: 2026-08-31  
**Author**: balisdev

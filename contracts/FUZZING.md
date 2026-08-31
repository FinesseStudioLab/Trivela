# Contract Fuzzing Guide

This document describes the comprehensive fuzzing infrastructure for Trivela smart contracts,
implemented to address issue #637 - Expanded Contract Fuzzing.

## Overview

The fuzzing infrastructure uses property-based testing (via `proptest`) to verify that critical
invariants hold under all possible inputs and execution sequences. This approach discovers edge
cases that traditional unit tests might miss.

## Fuzzing Strategy

### 1. Property-Based Testing with Proptest

Each contract has a dedicated `fuzz_test.rs` module containing comprehensive property-based tests
that:

- Generate thousands of random valid/invalid inputs
- Execute complex operation sequences
- Verify mathematical and logical invariants
- Test boundary conditions and edge cases

### 2. Invariant Categories

#### Campaign Contract Invariants (`contracts/campaign/src/fuzz_test.rs`)

- **Participant Count Consistency**: Stored count always equals actual registered participants
- **Max Cap Enforcement**: Participant count never exceeds configured limits
- **Time Window Validation**: Registrations outside time bounds are rejected
- **Admin Nonce Monotonicity**: Nonces increment atomically, preventing replay attacks
- **Referral System Integrity**: Referral counts match actual recorded relationships
- **Campaign State Transitions**: Inactive campaigns block operations correctly
- **Deregister Consistency**: Deregistration updates counts and state correctly
- **Admin Rotation Integrity**: Two-phase admin transfers work atomically
- **Integration Testing**: Random operation sequences maintain all invariants

#### Rewards Contract Invariants (`contracts/rewards/src/fuzz_test.rs`)

- **Balance Consistency**: User balances equal total credits minus claims
- **Credit Limit Enforcement**: Per-call limits are respected when configured
- **Rate Limiting**: Credit operations respect configured rate windows
- **Campaign Multiplier Accuracy**: Multiplier calculations use correct formula
- **Pause State Blocking**: Paused contracts reject credit/claim operations
- **Vesting Linear Interpolation**: Unlocked amounts follow linear vesting math
- **Overflow Protection**: Arithmetic operations fail safely on overflow
- **Integration Testing**: Complex operation sequences maintain balance integrity

### 3. Test Execution Modes

#### CI Integration (`/.github/workflows/contracts-ci.yml`)

- **Basic Fuzzing**: Quick proptest execution on every PR/push
- **Extended Fuzzing**: 30-60 second runs on pull requests
- **Regression Detection**: Automatic artifact upload for failing cases

#### Intensive Fuzzing (`/.github/workflows/contract-fuzzing.yml`)

- **Nightly Runs**: 5-minute intensive fuzzing sessions
- **Manual Triggers**: Configurable duration and contract selection
- **Regression Tracking**: Detailed reporting and artifact management

## Running Fuzzing Locally

### Quick Fuzzing (Development)

```bash
# Run all fuzz tests for campaign contract
cd contracts/campaign
cargo test --release -- fuzz_ --nocapture

# Run specific fuzz test
cargo test --release fuzz_participant_count_matches_registered_set -- --nocapture

# Run all fuzz tests for rewards contract
cd contracts/rewards
cargo test --release -- fuzz_ --nocapture
```

### Extended Fuzzing (Deep Testing)

```bash
# Run intensive fuzzing with custom case count
cd contracts/campaign
PROPTEST_CASES=10000 cargo test --release fuzz_random_operation_sequence -- --nocapture

# Time-bounded fuzzing
timeout 300s cargo test --release -- fuzz_ --nocapture
```

### Environment Variables

- `PROPTEST_CASES`: Number of test cases per property (default: varies by test)
- `PROPTEST_MAX_SHRINK_ITERS`: Shrinking iterations for minimal failing cases
- `RUST_LOG`: Enable debug logging for detailed execution traces

## Regression Handling

### When Fuzzing Finds Issues

1. **Regression Files**: Proptest creates `proptest-regressions/` with minimal failing cases
2. **Reproduce Locally**: Run the specific failing test to reproduce the issue
3. **Root Cause Analysis**: Determine if it's a real bug or test assumption error
4. **Fix Implementation**: Update contract logic or test constraints as appropriate
5. **Verify Fix**: Re-run fuzzing to ensure the issue is resolved

### Regression File Format

```
# proptest-regressions/fuzz_test.txt
cc 1aff00bf354188fdbd0f518dee49668d4c6e4a871192706527dfad2788355502 # shrinks to ops = [CreditForCampaign(1, 1)]
```

### Known Issues (To Be Addressed)

- **Rewards Contract**: Authorization failures in multiplier setup (admin auth context)
- **Rewards Contract**: Balance tracking inconsistencies in complex scenarios
- **Campaign Contract**: Cap retroactivity edge case (resolved - cap set after registrations)

## Best Practices

### Writing New Fuzz Tests

1. **Clear Invariant**: Define exactly what property must always hold
2. **Realistic Inputs**: Use bounded generators that reflect real usage patterns
3. **Comprehensive Coverage**: Test both happy paths and error conditions
4. **Atomic Operations**: Verify state consistency after each operation
5. **Integration Focus**: Test operation sequences, not just individual functions

### Test Strategy Guidelines

- **Quick Tests**: Use 100-1000 cases for CI integration
- **Deep Tests**: Use 10,000+ cases for thorough exploration
- **Targeted Tests**: Focus on specific invariants or recent bug areas
- **Integration Tests**: Verify complex multi-operation scenarios

## Implementation Details

### Test Infrastructure

- **Setup Functions**: `setup_fuzz()` provides clean contract instances
- **Property Strategies**: `arb_*` functions generate realistic test inputs
- **Helper Functions**: Common verification and assertion patterns
- **Error Handling**: Proper `try_*` method usage to test expected failures

### Performance Considerations

- **Release Builds**: Always use `--release` for fuzzing (significant speedup)
- **Parallel Execution**: Proptest runs cases in parallel by default
- **Memory Usage**: Large test suites may require increased memory limits
- **Time Bounds**: Use `timeout` for bounded fuzzing sessions

## Future Enhancements

### Planned Improvements

- **Seed Corpus**: Pre-generated interesting test cases for better coverage
- **Cross-Contract Integration**: Fuzz tests spanning multiple contracts
- **Performance Fuzzing**: Gas usage and execution time analysis
- **Formal Verification**: Integration with theorem provers for critical invariants

### Seed Corpus Strategy

```
contracts/{contract}/fuzz-seed-corpus/
├── edge-cases/          # Known boundary conditions
├── regression-cases/    # Previously found bugs
├── integration-flows/   # Complex multi-step operations
└── performance-cases/   # Gas-intensive scenarios
```

## Continuous Integration

The fuzzing infrastructure integrates seamlessly with the existing CI pipeline:

- **Every commit**: Basic proptest execution (< 1 minute)
- **Pull requests**: Extended fuzzing with artifact upload (< 3 minutes)
- **Nightly builds**: Intensive fuzzing with comprehensive reporting (5+ minutes)
- **Manual triggers**: On-demand fuzzing with configurable parameters

This layered approach ensures both rapid feedback during development and thorough exploration during
integration cycles.

## References

- [Proptest Documentation](https://docs.rs/proptest/)
- [Property-Based Testing Guide](https://increment.com/testing/in-praise-of-property-based-testing/)
- [Soroban Testing Best Practices](https://soroban.stellar.org/docs/fundamentals-and-concepts/testing)
- [Issue #637 - Expanded Contract Fuzzing](https://github.com/trivela/contracts/issues/637)

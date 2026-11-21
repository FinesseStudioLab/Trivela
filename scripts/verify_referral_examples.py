#!/usr/bin/env python3
"""Verify the REFERRAL_REWARDS.md worked examples against the on-chain formula.

The contract computes:
    bonus = (qualifying_amount as u128 * rate_bps as u128) / BPS_DENOMINATOR
where BPS_DENOMINATOR = 10_000, using floor (integer) division.

Run with: python3 scripts/verify_referral_examples.py
Exits non-zero on any mismatch.
"""

BPS_DENOMINATOR = 10_000
ZERO_BONUS_SENTINEL = "ZeroReferralBonus"


def compute_bonus(qualifying_amount: int, rate_bps: int) -> int:
    return (qualifying_amount * rate_bps) // BPS_DENOMINATOR


EXAMPLES = [
    # (qualifying_amount, rate_bps, expected_bonus_or_sentinel)
    (1_000_000, 500,       50_000),
    (1_000_000, 1_000,     100_000),
    (500_000,   250,       12_500),
    (1_000_000, 10_000,    1_000_000),
    (1_000_000, 100_000,   10_000_000),
    (99,        500,       4),
    (19,        500,       ZERO_BONUS_SENTINEL),
]

failures = []
for qualifying_amount, rate_bps, expected in EXAMPLES:
    actual = compute_bonus(qualifying_amount, rate_bps)
    if expected is ZERO_BONUS_SENTINEL:
        if actual != 0:
            failures.append(
                f"  ({qualifying_amount}, {rate_bps}): expected ZeroReferralBonus (bonus=0) "
                f"but got bonus={actual}"
            )
        else:
            print(f"  OK  ({qualifying_amount}, {rate_bps}) → 0 (ZeroReferralBonus)")
    else:
        if actual != expected:
            failures.append(
                f"  FAIL ({qualifying_amount}, {rate_bps}): expected {expected}, got {actual}"
            )
        else:
            print(f"  OK  ({qualifying_amount}, {rate_bps}) → {actual}")

if failures:
    print("\nMismatches found:")
    for f in failures:
        print(f)
    raise SystemExit(1)

print("\nAll referral reward examples verified.")

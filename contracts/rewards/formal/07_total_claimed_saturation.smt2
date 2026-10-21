; expect: sat
; INFORMATIONAL: CLAIMED uses saturating_add, so once it reaches u64::MAX it stops counting. The model
; finds such a state; it needs more than 1.8e19 points claimed over the contract's lifetime and is not
; reachable in practice. Recorded so the limit is explicit rather than assumed.
; Rewards contract accounting model (issue #1317). Amounts are u64: 0 <= v <= 18446744073709551615.
; State: S = TOTAL_SUPPLY, B = sum of every user balance, C = CLAIMED, x = the balance of the user an
; operation touches. Main invariant (#1021): S = B. Supporting facts: 0 <= x <= B, B <= U.
(set-logic QF_LIA)
(define-fun U () Int 18446744073709551615)
(declare-const C Int) (declare-const a Int)
(assert (and (<= 0 C) (<= C U) (> a 0) (<= a U)))
(assert (> (+ C a) U))
(check-sat)
(get-value (C a))

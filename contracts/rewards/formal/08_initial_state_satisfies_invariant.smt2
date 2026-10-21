; expect: unsat
; Base case: after initialize() the supply, the sum of balances and CLAIMED are all 0, so the
; invariant holds before the first operation (induction base for files 01-04).
; Source: RewardsContract::initialize sets CLAIMED = 0; TOTAL_SUPPLY and balances default to 0.
; Rewards contract accounting model (issue #1317). Amounts are u64: 0 <= v <= 18446744073709551615.
; State: S = TOTAL_SUPPLY, B = sum of every user balance, C = CLAIMED, x = the balance of the user an
; operation touches. Main invariant (#1021): S = B. Supporting facts: 0 <= x <= B, B <= U.
(set-logic QF_LIA)
(define-fun U () Int 18446744073709551615)
(declare-const S Int) (declare-const B Int) (declare-const C Int)
(assert (and (= S 0) (= B 0) (= C 0)))
(assert (not (and (= S B) (<= B U))))
(check-sat)

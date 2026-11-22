; expect: unsat
; Property: batch_credit over three recipients preserves S = B (the fixed implementation).
; Every recipient amount is credited exactly once (duplicates accumulate), TOTAL_SUPPLY grows by the
; batch total, and an overflow of either the batch total or the supply aborts before any write.
; Source: RewardsContract::batch_credit.
; Rewards contract accounting model (issue #1317). Amounts are u64: 0 <= v <= 18446744073709551615.
; State: S = TOTAL_SUPPLY, B = sum of every user balance, C = CLAIMED, x = the balance of the user an
; operation touches. Main invariant (#1021): S = B. Supporting facts: 0 <= x <= B, B <= U.
(set-logic QF_LIA)
(define-fun U () Int 18446744073709551615)
(declare-const S Int) (declare-const B Int)
(declare-const a1 Int) (declare-const a2 Int) (declare-const a3 Int)

(assert (and (= S B) (<= B U)))
(assert (and (> a1 0) (> a2 0) (> a3 0)))
(define-fun total () Int (+ a1 a2 a3))
; batch_total.checked_add and supply.checked_add both succeed (per-user checked_add also succeeds)
(assert (and (<= total U) (<= (+ S total) U)))

(define-fun S2 () Int (+ S total))
(define-fun B2 () Int (+ B a1 a2 a3))

(assert (not (and (= S2 B2) (<= B2 U))))
(check-sat)

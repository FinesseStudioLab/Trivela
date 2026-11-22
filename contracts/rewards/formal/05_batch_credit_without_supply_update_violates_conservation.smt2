; expect: sat
; NEGATIVE CONTROL: the batch_credit that wrote balances but not TOTAL_SUPPLY (before #1317).
; A satisfiable result is the counterexample: after one batch S != B. It shows the conservation
; property is not vacuous and is what exposed the missing supply update.
; Rewards contract accounting model (issue #1317). Amounts are u64: 0 <= v <= 18446744073709551615.
; State: S = TOTAL_SUPPLY, B = sum of every user balance, C = CLAIMED, x = the balance of the user an
; operation touches. Main invariant (#1021): S = B. Supporting facts: 0 <= x <= B, B <= U.
(set-logic QF_LIA)
(define-fun U () Int 18446744073709551615)
(declare-const S Int) (declare-const B Int) (declare-const a1 Int) (declare-const a2 Int)

(assert (and (= S B) (<= B U)))
(assert (and (> a1 0) (> a2 0) (<= (+ B a1 a2) U)))

(define-fun S2 () Int S)                    ; old code: supply untouched
(define-fun B2 () Int (+ B a1 a2))

(assert (not (= S2 B2)))
(check-sat)
(get-value (S B a1 a2))

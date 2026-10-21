; expect: unsat
; Property: a successful claim never increases the user's balance, the supply or the total points in
; circulation, and always increases CLAIMED by exactly the claimed amount when it does not saturate.
; Rewards contract accounting model (issue #1317). Amounts are u64: 0 <= v <= 18446744073709551615.
; State: S = TOTAL_SUPPLY, B = sum of every user balance, C = CLAIMED, x = the balance of the user an
; operation touches. Main invariant (#1021): S = B. Supporting facts: 0 <= x <= B, B <= U.
(set-logic QF_LIA)
(define-fun U () Int 18446744073709551615)
(declare-const S Int) (declare-const B Int) (declare-const x Int) (declare-const a Int) (declare-const C Int)

(assert (and (= S B) (<= 0 x) (<= x B) (<= B U) (<= 0 C) (<= C U)))
(assert (and (> a 0) (<= a x)))

(define-fun x2 () Int (- x a))
(define-fun S2 () Int (- S a))
(define-fun C2 () Int (ite (<= (+ C a) U) (+ C a) U))     ; saturating_add

; (balance and supply never increase) and (when CLAIMED does not saturate, S + C is unchanged)
(assert (not (and (<= x2 x) (<= S2 S)
                  (=> (<= (+ C a) U) (= (+ S2 C2) (+ S C))))))
(check-sat)

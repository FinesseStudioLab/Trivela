; expect: unsat
; Property: credit(user, a) preserves S = B (and the supporting facts) whenever it succeeds.
; Source: RewardsContract::credit  (new_balance = x + a, supply = S + a, both checked_add).
; Rewards contract accounting model (issue #1317). Amounts are u64: 0 <= v <= 18446744073709551615.
; State: S = TOTAL_SUPPLY, B = sum of every user balance, C = CLAIMED, x = the balance of the user an
; operation touches. Main invariant (#1021): S = B. Supporting facts: 0 <= x <= B, B <= U.
(set-logic QF_LIA)
(define-fun U () Int 18446744073709551615)
(declare-const S Int) (declare-const B Int) (declare-const x Int) (declare-const a Int)

; pre-state satisfies the invariant
(assert (and (= S B) (<= 0 x) (<= x B) (<= B U)))
; inputs: a > 0 (ZeroAmount otherwise); both checked_add calls must succeed (else Error::Overflow, no write)
(assert (and (> a 0) (<= a U) (<= (+ x a) U) (<= (+ S a) U)))

(define-fun S2 () Int (+ S a))
(define-fun B2 () Int (+ B a))
(define-fun x2 () Int (+ x a))

; search for a post-state that violates the invariant
(assert (not (and (= S2 B2) (<= 0 x2) (<= x2 B2) (<= B2 U))))
(check-sat)

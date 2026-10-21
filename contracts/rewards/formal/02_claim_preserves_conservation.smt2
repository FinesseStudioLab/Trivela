; expect: unsat
; Property: claim(user, a) preserves S = B, and the saturating_sub on TOTAL_SUPPLY never clamps.
; Source: RewardsContract::claim (new_balance = x.checked_sub(a); supply = S.saturating_sub(a)).
; Rewards contract accounting model (issue #1317). Amounts are u64: 0 <= v <= 18446744073709551615.
; State: S = TOTAL_SUPPLY, B = sum of every user balance, C = CLAIMED, x = the balance of the user an
; operation touches. Main invariant (#1021): S = B. Supporting facts: 0 <= x <= B, B <= U.
(set-logic QF_LIA)
(define-fun U () Int 18446744073709551615)
(declare-const S Int) (declare-const B Int) (declare-const x Int) (declare-const a Int)

(assert (and (= S B) (<= 0 x) (<= x B) (<= B U)))
; a > 0 and checked_sub succeeds (a <= x); otherwise Error::InsufficientBalance and nothing is written
(assert (and (> a 0) (<= a x)))

; saturating_sub(S, a) = if S >= a then S - a else 0
(define-fun S2 () Int (ite (>= S a) (- S a) 0))
(define-fun B2 () Int (- B a))
(define-fun x2 () Int (- x a))

; violation: invariant broken, or saturation actually clamped
(assert (or (not (= S2 B2))
            (< S a)
            (not (and (<= 0 x2) (<= x2 B2) (<= B2 U)))))
(check-sat)

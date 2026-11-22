; expect: unsat
; Property: admin_transfer(from, to, a) moves points without creating or destroying any (S and B unchanged).
; Source: RewardsContract::admin_transfer (from != to is enforced: SelfTransfer).
; Rewards contract accounting model (issue #1317). Amounts are u64: 0 <= v <= 18446744073709551615.
; State: S = TOTAL_SUPPLY, B = sum of every user balance, C = CLAIMED, x = the balance of the user an
; operation touches. Main invariant (#1021): S = B. Supporting facts: 0 <= x <= B, B <= U.
(set-logic QF_LIA)
(define-fun U () Int 18446744073709551615)
(declare-const S Int) (declare-const B Int)
(declare-const xf Int) (declare-const xt Int) (declare-const a Int)

; two distinct users: their balances are disjoint parts of B
(assert (and (= S B) (<= 0 xf) (<= 0 xt) (<= (+ xf xt) B) (<= B U)))
; a > 0, checked_sub on the sender succeeds, checked_add on the receiver succeeds
(assert (and (> a 0) (<= a xf) (<= (+ xt a) U)))

(define-fun xf2 () Int (- xf a))
(define-fun xt2 () Int (+ xt a))
(define-fun B2 () Int (+ (- B xf) xf2 (- xt) xt2))   ; B recomputed from the changed balances
(define-fun S2 () Int S)

(assert (not (and (= S2 B2) (<= 0 xf2) (<= 0 xt2) (<= (+ xf2 xt2) B2) (<= B2 U))))
(check-sat)

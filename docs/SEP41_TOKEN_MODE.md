# SEP-41 Token Mode: Design & Trade-offs

`enable_token_mode` layers a SEP-41-shaped interface on top of the existing points ledger so points
can act as a transferable, wallet/DEX-compatible asset. This is opt-in and **one-way** — there is no
`disable_token_mode`.

## Function naming (important caveat)

The SEP-41 interface is implemented as `sep41_transfer`, `sep41_approve`, `sep41_transfer_from`,
`sep41_allowance`, `sep41_burn`, `sep41_burn_from`, `sep41_balance`, `sep41_decimals`, `sep41_name`,
`sep41_symbol` — **not** the bare canonical names (`transfer`, `approve`, etc.) that the standard
specifies and that generic wallets/DEXes call by convention.

This is intentional, not an oversight: the contract already exposes `balance` (points balance) and
`admin_transfer` (admin-only ledger move) with different semantics than SEP-41's
`balance`/`transfer`, so the canonical names can't be reused without breaking the existing points
API.

**Consequence:** off-the-shelf wallets/DEXes that call the standard entry-point names directly will
not recognize this contract as a SEP-41 token as-is. Two supported paths to full interop:

1. Deploy a thin proxy/router contract exposing the canonical SEP-41 names that forwards to
   `sep41_*` on this contract — recommended if broad wallet support is required and this contract's
   storage/admin model should stay as-is.
2. Fork/instantiate a token-mode-only build of this contract with a build flag renaming `sep41_*` to
   the canonical names, for deployments where the points-API surface isn't needed.

## Shared ledger, not a separate token

Token-mode operations (`sep41_transfer`, `sep41_burn`, etc.) read and write the _same_ per-user
balance entry (`BALANCE`) used by `credit`, `claim`, and `redeem`. This is deliberate: a user's
points balance and token balance are always the same number, so campaigns can keep
crediting/claiming through the points API while wallets interact through the token API. The
trade-off is that admin actions on the points side (`admin_transfer`, `claim`, `redeem`) move the
same balance a token holder sees — there is no isolation between the two APIs.

## Allowance & expiry semantics

- `sep41_approve(from, spender, amount, expiration_ledger)`:
  - `expiration_ledger == 0` means the approval never expires.
  - `expiration_ledger > 0` must be strictly greater than the current ledger sequence at approval
    time, or the call fails with `InvalidExpiration`.
  - Approving again fully overwrites the prior `(amount, expiration_ledger)` pair for that
    `(owner, spender)`; it does not add to it.
- On `sep41_transfer_from` / `sep41_burn_from`:
  - If `expiration_ledger > 0` and the current ledger sequence has passed it, the stored allowance
    is deleted and the call fails with `ApprovalExpired` — the caller must re-approve.
  - Otherwise the requested amount is checked against the remaining allowance (`AllowanceExceeded`
    if insufficient) and deducted. When the remaining allowance reaches zero, the storage entry is
    removed rather than left as an explicit `(0, expiration)` — this keeps `sep41_allowance` reads
    and storage-bloat behavior consistent with "no active allowance".

## Amount range

SEP-41 amounts are `i128`, but this contract's internal ledger is `u64`. Negative amounts and
amounts above `u64::MAX` are rejected with `Error::Overflow` before any state is touched (see
`sep41_amount_to_u64` — this closes a prior gap where such values were silently truncated by an
`as u64` cast).

## Pause interaction

Token-mode entry points (`sep41_transfer`, `sep41_transfer_from`, `sep41_burn`, `sep41_burn_from`)
respect only the **global** pause flag (`set_paused`), not the per-function
`pscredit`/`psclaim`/`psredeem` flags introduced for the points API. Pausing `claim` or `redeem`
alone does not stop token transfers; use the global pause if token-mode operations must also be
halted.

## Testing

Conformance behavior is covered in `contracts/integration/tests/sep41_conformance.rs`: metadata
reads, the token-mode gate, balance mirroring, transfer (success/insufficient balance/overflow),
approve/allowance (including expiry and zeroed-allowance cleanup), transfer_from, burn, burn_from,
and the global pause interaction.

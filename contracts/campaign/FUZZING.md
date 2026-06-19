# Campaign Contract Fuzzing

The campaign contract has a property-based fuzz target that exercises participant registration
end-to-end: window enforcement, cap enforcement, Merkle allowlist gating, and the idempotent
register/deregister cycle.

## Layout

```
contracts/campaign/fuzz/
├── Cargo.toml                       # isolated cargo-fuzz workspace
└── fuzz_targets/
    └── fuzz_register.rs             # property-based target
```

The fuzz crate is declared with `[workspace]` so it does not participate in the regular
`cargo test --workspace` run.

## Running the fuzzer locally

```bash
# one-time
cargo install cargo-fuzz

# from the contract crate root
cd contracts/campaign
cargo fuzz run fuzz_register

# bounded run, useful for CI smoke checks
cargo fuzz run fuzz_register -- -max_total_time=60
```

`cargo fuzz` requires a nightly toolchain (`rustup toolchain install nightly`) and is **Linux/macOS
only** — Windows users should run it inside WSL.

## Invariants checked

For every randomized
`(register | deregister | set_window | set_max_cap | set_merkle_root | advance_ledger)` sequence the
harness asserts:

1. `get_participant_count() <= max_cap` whenever `max_cap > 0`.
2. Re-registering the same address keeps the count flat (idempotency).
3. Outside the configured `[start, end]` window, `register` returns `Error::OutsideTimeWindow` and
   the count is unchanged.
4. With a Merkle root configured and an invalid proof, `register` returns `Error::NotInAllowlist`
   and the count is unchanged.
5. A harness-tracked shadow set of registered participants stays in sync with `is_participant` for
   every user after every operation.

A failure prints a reproducer to `fuzz/artifacts/fuzz_register/` which can be replayed with
`cargo fuzz run fuzz_register artifacts/fuzz_register/<id>`.

## CI

The contracts workflow runs `cargo fuzz build` (no execution) to keep the target compiling. Real
fuzzing runs are opt-in — kick them off manually when investigating a regression in registration
logic.

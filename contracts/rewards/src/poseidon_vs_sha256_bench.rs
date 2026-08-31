//! Benchmark: Poseidon vs. SHA-256 for a single Merkle-node hash, measured
//! in Soroban CPU instructions via the contract budget. This does NOT know
//! about your existing SHA-256 Merkle implementation's exact call shape --
//! swap `sha256_pair` below for whatever your current code actually calls.
//!
//! Run with: cargo test -p rewards --features testutils -- --nocapture
//! (adjust feature name to whatever your crate uses for soroban testutils)

#[cfg(test)]
mod bench {
    use crate::poseidon::hash_pair;
    use soroban_sdk::{BytesN, Env};

    fn sha256_pair(env: &Env, left: &BytesN<32>, right: &BytesN<32>) -> BytesN<32> {
        let mut buf = soroban_sdk::Bytes::new(env);
        buf.append(&left.clone().into());
        buf.append(&right.clone().into());
        env.crypto().sha256(&buf).into()
    }

    #[test]
    fn compare_cpu_instructions() {
        let env = Env::default();
        env.budget().reset_default(); // requires `testutils` feature

        let left = BytesN::from_array(&env, &[1u8; 32]);
        let right = BytesN::from_array(&env, &[2u8; 32]);

        let before = env.budget().cpu_instruction_cost();
        let _ = sha256_pair(&env, &left, &right);
        let after_sha256 = env.budget().cpu_instruction_cost();

        let _ = hash_pair(&env, &left, &right).unwrap();
        let after_poseidon = env.budget().cpu_instruction_cost();

        let sha256_cost = after_sha256 - before;
        let poseidon_cost = after_poseidon - after_sha256;

        // Note: don't assert a specific ratio here -- record the numbers in
        // TEST_COVERAGE.md / the PR description instead, since Soroban's
        // cost model can shift between SDK versions.
    }
}
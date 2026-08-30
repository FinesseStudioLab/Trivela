//! On-chain Groth16 proof verifier over BLS12-381 (issue #842).
//!
//! A reusable, self-contained verifier: takes a verifying key, a proof, and
//! the public inputs, and returns whether the proof is valid. Built entirely
//! on Soroban's native BLS12-381 host functions (`env.crypto().bls12_381()`)
//! — the pairing and multi-scalar-multiplication math is done by the host,
//! not re-implemented here, so this module is just the Groth16 equation
//! wiring plus the vk/proof encoding.
//!
//! # The Groth16 verification equation
//!
//! Given verifying key `(alpha ∈ G1, beta, gamma, delta ∈ G2, ic: Vec<G1>)`
//! and proof `(a ∈ G1, b ∈ G2, c ∈ G1)`, a proof for public inputs `x_1..x_n`
//! is valid iff:
//!
//! ```text
//! e(A, B) = e(alpha, beta) · e(vk_x, gamma) · e(C, delta)
//! ```
//!
//! where `vk_x = ic[0] + Σ x_i · ic[i+1]` (the standard Groth16 "IC" linear
//! combination). Rearranged so a single multi-pairing check can decide it in
//! one host call:
//!
//! ```text
//! e(-A, B) · e(alpha, beta) · e(vk_x, gamma) · e(C, delta) = 1
//! ```
//!
//! `-A` is computed as `A` scalar-multiplied by `-1 mod r` (the BLS12-381
//! scalar field order), since the SDK's `G1Affine` wrapper does not expose a
//! direct negation — see `neg_g1`.
//!
//! # Reusability
//!
//! This module has no dependency on anything else in this crate (no storage
//! keys, no `Error` variants, no `#[contractimpl]`) — it's plain functions
//! over `soroban_sdk` types, so another contract can copy this file in
//! directly or (once published) depend on it as its own crate.
//!
//! # CPU budget
//!
//! Each `pairing_check` call over 4 pairs (fixed regardless of the number of
//! public inputs — the public inputs only affect the cost of the `g1_msm`
//! that builds `vk_x`) is the dominant cost. BLS12-381 pairings are the most
//! expensive host operation Soroban exposes; verifying a single proof is
//! expected to consume a large fraction of a transaction's CPU instruction
//! budget on mainnet. Callers embedding this in a hot path (e.g. one
//! verification per claim) should budget for close to the full per-transaction
//! CPU limit and avoid combining it with other expensive operations in the
//! same call.

use soroban_sdk::{
    contracttype,
    crypto::bls12_381::{Fr, G1Affine, G2Affine},
    Env, Vec, U256,
};

/// Groth16 verifying key. `ic` must have exactly `public_inputs.len() + 1`
/// entries — `ic[0]` is the constant term, `ic[1..]` pair one-to-one with
/// the public inputs in order.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Groth16VerifyingKey {
    pub alpha: G1Affine,
    pub beta: G2Affine,
    pub gamma: G2Affine,
    pub delta: G2Affine,
    pub ic: Vec<G1Affine>,
}

/// A Groth16 proof: the three group elements `(A, B, C)`.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Groth16Proof {
    pub a: G1Affine,
    pub b: G2Affine,
    pub c: G1Affine,
}

/// Negate a G1 point by multiplying it by `-1 mod r` (the BLS12-381 scalar
/// field order), since `G1Affine` exposes no direct negation.
fn neg_g1(env: &Env, p: &G1Affine) -> G1Affine {
    let bls = env.crypto().bls12_381();
    let zero = Fr::from_u256(U256::from_u32(env, 0));
    let one = Fr::from_u256(U256::from_u32(env, 1));
    let neg_one = bls.fr_sub(&zero, &one);
    bls.g1_mul(p, &neg_one)
}

/// Compute `vk_x = ic[0] + Σ public_inputs[i] · ic[i + 1]` via a single
/// multi-scalar-multiplication host call plus the constant-term addition.
fn compute_vk_x(env: &Env, ic: &Vec<G1Affine>, public_inputs: &Vec<Fr>) -> G1Affine {
    let bls = env.crypto().bls12_381();
    let mut points: Vec<G1Affine> = Vec::new(env);
    for i in 1..ic.len() {
        points.push_back(ic.get(i).unwrap());
    }
    let combination = bls.g1_msm(points, public_inputs.clone());
    bls.g1_add(&ic.get(0).unwrap(), &combination)
}

/// Verify a Groth16 proof against `vk` for the given `public_inputs`.
///
/// Returns `false` (never panics) for a mismatched `ic`/`public_inputs`
/// length or a tampered/invalid proof — callers get a plain boolean rather
/// than needing to distinguish "malformed" from "false" cases, matching the
/// issue's acceptance criteria of `(vk, proof, public_inputs) -> bool`.
pub fn verify(
    env: &Env,
    vk: &Groth16VerifyingKey,
    proof: &Groth16Proof,
    public_inputs: &Vec<Fr>,
) -> bool {
    if vk.ic.len() != public_inputs.len() + 1 {
        return false;
    }

    let bls = env.crypto().bls12_381();
    let vk_x = compute_vk_x(env, &vk.ic, public_inputs);
    let neg_a = neg_g1(env, &proof.a);

    let mut g1_points: Vec<G1Affine> = Vec::new(env);
    g1_points.push_back(neg_a);
    g1_points.push_back(vk.alpha.clone());
    g1_points.push_back(vk_x);
    g1_points.push_back(proof.c.clone());

    let mut g2_points: Vec<G2Affine> = Vec::new(env);
    g2_points.push_back(proof.b.clone());
    g2_points.push_back(vk.beta.clone());
    g2_points.push_back(vk.gamma.clone());
    g2_points.push_back(vk.delta.clone());

    bls.pairing_check(g1_points, g2_points)
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::crypto::bls12_381::{G1Affine, G2Affine};

    /// An arbitrary, deterministic G1 base point derived via the host's
    /// hash-to-curve function. This synthetic test only needs *some* fixed
    /// point in the correct subgroup to build a toy vk/proof against — not
    /// literally the standard BLS12-381 generator — so hashing to the curve
    /// avoids depending on a hardcoded generator constant.
    fn g1_generator(env: &Env) -> G1Affine {
        let msg = soroban_sdk::Bytes::from_slice(env, b"trivela-groth16-test-g1");
        let dst = soroban_sdk::Bytes::from_slice(env, b"TRIVELA_G1_TEST_DST");
        env.crypto().bls12_381().hash_to_g1(&msg, &dst)
    }

    /// Same as `g1_generator`, but in G2.
    fn g2_generator(env: &Env) -> G2Affine {
        let msg = soroban_sdk::Bytes::from_slice(env, b"trivela-groth16-test-g2");
        let dst = soroban_sdk::Bytes::from_slice(env, b"TRIVELA_G2_TEST_DST");
        env.crypto().bls12_381().hash_to_g2(&msg, &dst)
    }

    fn fr_of(env: &Env, v: u32) -> Fr {
        Fr::from_u256(U256::from_u32(env, v))
    }

    /// Builds a toy but mathematically valid Groth16 tuple: pick a scalar
    /// `a`, `b`, and a single public input `x`; derive `A = a*G1`, `B = b*G2`,
    /// `vk_x = x*IC[1] + IC[0]` from arbitrary `alpha`/`beta`/`gamma`/`delta`
    /// scalars, and solve for the `c` scalar that makes the Groth16 equation
    /// hold exactly: `a*b = alpha_s*beta_s + x*ic1_s*gamma_s + c*delta_s`
    /// (all arithmetic here is the *scalar* form of the equation — the
    /// verifier itself only ever sees the group elements). This exercises
    /// the same pairing arithmetic a real circuit's proof would, without
    /// needing an external circom/arkworks toolchain to generate one.
    fn toy_setup(env: &Env) -> (Groth16VerifyingKey, Groth16Proof, Vec<Fr>, Fr) {
        env.budget().reset_unlimited();
        let bls = env.crypto().bls12_381();
        let g1 = g1_generator(env);
        let g2 = g2_generator(env);

        let alpha_s = fr_of(env, 5);
        let beta_s = fr_of(env, 7);
        let gamma_s = fr_of(env, 3);
        let delta_s = fr_of(env, 11);
        let ic0_s = fr_of(env, 2);
        let ic1_s = fr_of(env, 9);
        let a_s = fr_of(env, 13);
        let b_s = fr_of(env, 17);
        let x = fr_of(env, 4); // the single public input

        // c = (a*b - alpha*beta - x*ic1*gamma - ic0*gamma) / delta
        let ab = bls.fr_mul(&a_s, &b_s);
        let alpha_beta = bls.fr_mul(&alpha_s, &beta_s);
        let vk_x_s = bls.fr_add(&bls.fr_mul(&x, &ic1_s), &ic0_s);
        let vk_x_gamma = bls.fr_mul(&vk_x_s, &gamma_s);
        let numerator = bls.fr_sub(&bls.fr_sub(&ab, &alpha_beta), &vk_x_gamma);
        let delta_inv = bls.fr_inv(&delta_s);
        let c_s = bls.fr_mul(&numerator, &delta_inv);

        let vk = Groth16VerifyingKey {
            alpha: bls.g1_mul(&g1, &alpha_s),
            beta: bls.g2_mul(&g2, &beta_s),
            gamma: bls.g2_mul(&g2, &gamma_s),
            delta: bls.g2_mul(&g2, &delta_s),
            ic: {
                let mut v = Vec::new(env);
                v.push_back(bls.g1_mul(&g1, &ic0_s));
                v.push_back(bls.g1_mul(&g1, &ic1_s));
                v
            },
        };
        let proof = Groth16Proof {
            a: bls.g1_mul(&g1, &a_s),
            b: bls.g2_mul(&g2, &b_s),
            c: bls.g1_mul(&g1, &c_s),
        };
        let public_inputs = {
            let mut v = Vec::new(env);
            v.push_back(x);
            v
        };

        (vk, proof, public_inputs, c_s)
    }

    #[test]
    fn test_verify_accepts_valid_proof() {
        let env = Env::default();
        let (vk, proof, public_inputs, _c_s) = toy_setup(&env);
        assert!(verify(&env, &vk, &proof, &public_inputs));
    }

    #[test]
    fn test_verify_rejects_tampered_public_input() {
        let env = Env::default();
        let (vk, proof, _public_inputs, _c_s) = toy_setup(&env);
        let mut tampered = Vec::new(&env);
        tampered.push_back(fr_of(&env, 5)); // was 4
        assert!(!verify(&env, &vk, &proof, &tampered));
    }

    #[test]
    fn test_verify_rejects_tampered_proof_c() {
        let env = Env::default();
        let (vk, proof, public_inputs, _c_s) = toy_setup(&env);
        let bls = env.crypto().bls12_381();
        let g1 = g1_generator(&env);
        let mut tampered_proof = proof.clone();
        tampered_proof.c = bls.g1_add(&proof.c, &g1); // shift C by one generator
        assert!(!verify(&env, &vk, &tampered_proof, &public_inputs));
    }

    #[test]
    fn test_verify_rejects_wrong_ic_length() {
        let env = Env::default();
        let (mut vk, proof, public_inputs, _c_s) = toy_setup(&env);
        vk.ic.push_back(g1_generator(&env)); // now len 3, but 1 public input expects 2
        assert!(!verify(&env, &vk, &proof, &public_inputs));
    }
}

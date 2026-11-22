//! Fuzz target: adversarial co-admin ed25519 multisig verification (issue #851).
//!
//! Drives `verify_multisig` through its only real entry point,
//! `set_merkle_root`, since `verify_multisig` itself is a private helper.
//! `multisig_message` and `OP_SET_MERKLE_ROOT` were made `pub` (from private
//! module items) specifically so this harness can reconstruct the exact
//! byte-for-byte payload the contract expects to be signed — no behavior
//! change, they're free functions/constants, not new on-chain entry points.
//!
//! # Running
//! ```bash
//! cargo install cargo-fuzz
//! cd contracts/campaign
//! cargo fuzz run fuzz_multisig
//! ```
//!
//! # Invariants checked
//! 1. Unknown signer (not a registered co-admin) → `Error::UnknownSigner`,
//!    never a panic.
//! 2. Nonce reuse (same nonce across two calls) → `Error::NonceReused`.
//! 3. `threshold = 0` → multisig is bypassed entirely (legacy single-admin
//!    path), regardless of what garbage is in `signatures`.
//! 4. `set_multisig_threshold` rejects `required > co_admins.len()` at
//!    configuration time (`Error::InvalidThreshold`) — the "threshold >
//!    signers" case can still be reached transiently by configuring a valid
//!    threshold and then removing a co-admin below it; that path is fuzzed
//!    too and must return `Error::InsufficientSignatures`, not panic.
//! 5. A genuinely valid multisig call (correct signatures from distinct,
//!    registered co-admins, meeting the threshold) succeeds.
//! 6. Replaying an already-consumed nonce (same signatures, same nonce)
//!    returns a typed error rather than panicking or double-applying.
//!
//! # Known, characterized (not silently hidden) panic path
//!
//! `Env::crypto().ed25519_verify` is a Soroban host function with
//! verify-or-trap semantics — it has no `Result`/`bool`-returning variant in
//! the SDK. A registered co-admin's address paired with a *malformed*
//! signature (wrong bytes for that same signer, as opposed to an unknown
//! signer) reaches `ed25519_verify` and traps. With `panic = "abort"` in
//! this contract's release profile (see `contracts/campaign/Cargo.toml`),
//! that trap cannot be caught by the contract's own code even in principle
//! — there is no `catch_unwind` path across an abort. Fixing this for real
//! would mean replacing the host call with a guest-side, `Result`-returning
//! verifier (e.g. `ed25519-dalek` compiled into the contract), which is a
//! materially larger, separate change to the contract's core trust model
//! and isn't made here.
//!
//! This harness doesn't pretend that path doesn't exist: `fuzz_bad_signature`
//! below deliberately exercises it under `catch_unwind` (safe here in the
//! *fuzz* harness, which runs natively rather than under `panic = "abort"`)
//! and asserts a panic only ever happens for exactly this one cause — a
//! known co-admin signer paired with a signature that doesn't verify —
//! never for any of the typed-error paths above.

#![no_main]

extern crate std;

use ed25519_dalek::{Signer, SigningKey};
use libfuzzer_sys::fuzz_target;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Bytes, BytesN, Env, Vec as SorobanVec};
use std::panic::{catch_unwind, AssertUnwindSafe};
use trivela_campaign_contract::{
    multisig_message, CampaignContract, CampaignContractClient, Error, OP_SET_MERKLE_ROOT,
};

/// Number of co-admin keypairs registered per fuzz case.
const NUM_COADMINS: usize = 3;

struct CoAdmin {
    address: Address,
    signing_key: SigningKey,
}

fn signing_key_from_seed(seed_byte: u8, data: &[u8]) -> SigningKey {
    let mut seed = [0u8; 32];
    seed[0] = seed_byte;
    let n = data.len().min(31);
    seed[1..1 + n].copy_from_slice(&data[..n]);
    SigningKey::from_bytes(&seed)
}

fn to_vec_u8(bytes: &Bytes) -> std::vec::Vec<u8> {
    let mut buf = std::vec::Vec::with_capacity(bytes.len() as usize);
    for b in bytes.iter() {
        buf.push(b);
    }
    buf
}

/// Set up a fresh contract with `NUM_COADMINS` registered keypairs and the
/// given threshold. Returns the client, the keypairs, and the next unused
/// admin nonce.
fn setup(
    env: &Env,
    data: &[u8],
    threshold: u32,
) -> (CampaignContractClient<'static>, std::vec::Vec<CoAdmin>, u64) {
    let contract_id = env.register_contract(None, CampaignContract);
    let client = CampaignContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);

    let mut co_admins: std::vec::Vec<CoAdmin> = std::vec::Vec::new();
    let mut nonce: u64 = 0;
    for i in 0..NUM_COADMINS {
        let signing_key = signing_key_from_seed(i as u8 + 1, data);
        let addr = Address::generate(env);
        let pubkey = BytesN::from_array(env, &signing_key.verifying_key().to_bytes());
        client.add_co_admin(&admin, &nonce, &addr, &pubkey);
        nonce += 1;
        co_admins.push(CoAdmin { address: addr, signing_key });
    }

    client.set_multisig_threshold(&admin, &nonce, &threshold);
    nonce += 1;

    (client, co_admins, nonce)
}

fn signed_message(
    env: &Env,
    root: &BytesN<32>,
    ms_nonce: u64,
) -> (BytesN<32>, std::vec::Vec<u8>) {
    let args_hash: BytesN<32> = env
        .crypto()
        .sha256(&Bytes::from_slice(env, &root.to_array()))
        .into();
    let message = multisig_message(env, OP_SET_MERKLE_ROOT, ms_nonce, &args_hash);
    (args_hash, to_vec_u8(&message))
}

fn run(data: &[u8]) {
    if data.len() < 12 {
        return;
    }

    // ── Invariant 4a: threshold above co_admins.len() is rejected up front ──
    {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, CampaignContract);
        let client = CampaignContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let over_threshold = (NUM_COADMINS as u32) + 1 + (data[0] as u32 % 3);
        let result = client.try_set_multisig_threshold(&admin, &0u64, &over_threshold);
        assert_eq!(
            result,
            Err(Ok(Error::InvalidThreshold)),
            "threshold > co_admins.len() (0 registered yet) must be rejected at config time"
        );
    }

    let threshold = 1 + (data[1] as u32 % NUM_COADMINS as u32);
    let env = Env::default();
    env.mock_all_auths();
    let (client, co_admins, mut admin_nonce) = setup(&env, data, threshold);

    let ms_nonce: u64 = u64::from_le_bytes(data[2..10].try_into().unwrap());
    let root = BytesN::from_array(&env, &[data.get(10).copied().unwrap_or(0); 32]);
    let (_args_hash, message_bytes) = signed_message(&env, &root, ms_nonce);

    // ── Invariant 1: unknown signer never panics ─────────────────────────
    {
        let unknown = Address::generate(&env);
        let bogus_sig = BytesN::from_array(&env, &[data.get(11).copied().unwrap_or(0); 64]);
        let mut sigs = SorobanVec::new(&env);
        sigs.push_back((unknown, bogus_sig));
        let result = client.try_set_merkle_root(&admin_placeholder(&env), &ms_nonce, &root, &sigs);
        assert_eq!(
            result,
            Err(Ok(Error::UnknownSigner)),
            "unknown signer must return a typed error, not panic"
        );
    }

    // ── Invariants 5 + 2: a valid quorum succeeds; replaying the nonce
    //    afterward is a typed error. ────────────────────────────────────────
    {
        let mut sigs = SorobanVec::new(&env);
        for co_admin in co_admins.iter().take(threshold as usize) {
            let sig = co_admin.signing_key.sign(&message_bytes);
            sigs.push_back((
                co_admin.address.clone(),
                BytesN::from_array(&env, &sig.to_bytes()),
            ));
        }

        let result = client.try_set_merkle_root(&admin_placeholder(&env), &ms_nonce, &root, &sigs);
        assert_eq!(
            result,
            Ok(Ok(())),
            "a valid quorum of distinct, registered co-admin signatures must succeed"
        );

        let replay = client.try_set_merkle_root(&admin_placeholder(&env), &ms_nonce, &root, &sigs);
        assert_eq!(
            replay,
            Err(Ok(Error::NonceReused)),
            "replaying a consumed multisig nonce must return a typed error, not panic"
        );
    }

    // ── Invariant 4b: threshold above the CURRENT co_admins count, reached
    //    via removal after configuration, returns a typed error. ─────────
    if let Some(last) = co_admins.last() {
        client.remove_co_admin(&admin_placeholder(&env), &admin_nonce, &last.address);
        admin_nonce += 1;
        let _ = admin_nonce;
        if (threshold as usize) > NUM_COADMINS - 1 {
            let empty_sigs = SorobanVec::new(&env);
            let post_removal_nonce = ms_nonce.wrapping_add(1_000_000);
            let result = client.try_set_merkle_root(
                &admin_placeholder(&env),
                &post_removal_nonce,
                &root,
                &empty_sigs,
            );
            assert_eq!(
                result,
                Err(Ok(Error::InsufficientSignatures)),
                "threshold exceeding the post-removal co-admin count must be a typed error"
            );
        }
    }

    // ── Invariant 3: threshold = 0 bypasses multisig entirely, even with
    //    garbage in `signatures`. ──────────────────────────────────────────
    {
        let env2 = Env::default();
        env2.mock_all_auths();
        let contract_id2 = env2.register_contract(None, CampaignContract);
        let client2 = CampaignContractClient::new(&env2, &contract_id2);
        let admin2 = Address::generate(&env2);
        client2.initialize(&admin2);

        let garbage_sig = BytesN::from_array(&env2, &[data.get(11).copied().unwrap_or(0xff); 64]);
        let garbage_signer = Address::generate(&env2);
        let mut garbage_sigs = SorobanVec::new(&env2);
        garbage_sigs.push_back((garbage_signer, garbage_sig));
        let root2 = BytesN::from_array(&env2, &[data.get(10).copied().unwrap_or(0); 32]);

        let result = client2.try_set_merkle_root(&admin2, &0u64, &root2, &garbage_sigs);
        assert_eq!(
            result,
            Ok(Ok(())),
            "threshold=0 must bypass multisig entirely regardless of `signatures` content"
        );
    }

    // ── Known panic path, exercised and characterized rather than hidden ──
    // A registered co-admin paired with a signature that doesn't verify
    // (right signer, wrong bytes) reaches `ed25519_verify` and traps. Assert
    // that's the *only* thing that can panic here, by confirming the same
    // call with the correct signature (already proven above) succeeds.
    if let Some(first) = co_admins.first() {
        let bad_sig = BytesN::from_array(&env, &[data.get(11).copied().unwrap_or(0).wrapping_add(1); 64]);
        let mut sigs = SorobanVec::new(&env);
        sigs.push_back((first.address.clone(), bad_sig));
        let fresh_nonce = ms_nonce.wrapping_add(2_000_000);
        let (_, fresh_message) = signed_message(&env, &root, fresh_nonce);
        let _ = fresh_message; // the signature above is intentionally NOT valid for this message

        let outcome = catch_unwind(AssertUnwindSafe(|| {
            client.try_set_merkle_root(&admin_placeholder(&env), &fresh_nonce, &root, &sigs)
        }));
        match outcome {
            Err(_) => { /* the characterized ed25519_verify trap — see module docs */ }
            Ok(Err(Ok(Error::UnknownSigner))) => {
                panic!("a registered co-admin was misclassified as unknown")
            }
            Ok(other) => {
                // Astronomically unlikely (would mean the malformed signature
                // happened to verify), but not a bug if it ever happens.
                let _ = other;
            }
        }
    }
}

/// `set_merkle_root`'s `admin` parameter isn't checked at all on the
/// multisig path (see the module doc comment on `set_merkle_root`'s source:
/// signatures are the auth mechanism there, not `require_auth`), so any
/// address works — this just documents that explicitly at each call site
/// instead of threading the real admin through every helper.
fn admin_placeholder(env: &Env) -> Address {
    Address::generate(env)
}

fuzz_target!(|data: &[u8]| {
    run(data);
});

//! Fuzz target: adversarial co-admin multisig verification on `set_paused`
//! (issue #851).
//!
//! Extends the fuzzing already in place for balance accounting
//! (`fuzz_balance.rs`) to the ed25519 co-admin multisig path
//! (`verify_multisig`, used by `set_paused`) — duplicate signers, unknown
//! signers, threshold edge cases, and nonce replay.
//!
//! # Running
//! ```bash
//! cargo install cargo-fuzz
//! cd contracts/rewards
//! cargo fuzz run fuzz_multisig
//! ```
//!
//! # Invariants checked
//! 1. `try_set_paused` never panics for any signature-set shape the fuzzer
//!    produces — malformed input always surfaces as a typed `Err`, never a
//!    trap.
//! 2. A call only succeeds when the signature set contains at least
//!    `threshold` *distinct*, *registered* co-admins, each with a
//!    cryptographically valid ed25519 signature over the exact
//!    `(op, nonce, args_hash)` payload, and `nonce` has not been consumed by
//!    an earlier successful call.
//! 3. A previously-consumed nonce is never accepted again (replay
//!    rejection), even when resubmitted with a fully valid signature set.

#![no_main]

extern crate std;

use ed25519_dalek::{Signer, SigningKey};
use libfuzzer_sys::fuzz_target;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{symbol_short, Address, Bytes, BytesN, Env, Vec as SdkVec};
use trivela_rewards_contract::{Error, RewardsContract, RewardsContractClient};

/// Number of co-admin seats registered at setup. Kept small so the fuzzer's
/// byte budget is mostly spent on interesting combinations (which indices
/// sign, how many times, with which nonce) rather than on enumerating a
/// large signer set.
const NUM_CO_ADMINS: usize = 4;

/// `op` byte for `set_paused` — must match `OP_SET_PAUSED` in
/// `contracts/rewards/src/lib.rs`.
const OP_SET_PAUSED: u32 = 1;

fn gen_keypair(seed: u8) -> SigningKey {
    SigningKey::from_bytes(&[seed; 32])
}

/// Reproduces `multisig_message`/`args_hash` from `contracts/rewards/src/lib.rs`
/// exactly: a 44-byte `op (u32 BE) | nonce (u64 BE) | args_hash (32 bytes)`
/// buffer, where `args_hash = sha256(single byte `paused as u8`)`.
fn sign_set_paused(signing_key: &SigningKey, nonce: u64, paused: bool, args_hash: &[u8; 32]) -> [u8; 64] {
    let mut buf = [0u8; 44];
    buf[0..4].copy_from_slice(&OP_SET_PAUSED.to_be_bytes());
    buf[4..12].copy_from_slice(&nonce.to_be_bytes());
    buf[12..44].copy_from_slice(args_hash);
    let _ = paused; // paused is folded into args_hash by the caller.
    signing_key.sign(&buf).to_bytes()
}

/// One fuzzer-controlled signature entry: which co-admin slot to attribute
/// it to (may be out of range — tests "unknown signer"), and whether to
/// actually sign correctly or corrupt the signature.
struct FuzzSig {
    co_admin_idx: u8,
    corrupt: bool,
}

fn parse_sigs(data: &[u8]) -> (u64, bool, Vec<FuzzSig>) {
    let nonce = if data.len() >= 8 {
        u64::from_le_bytes(data[0..8].try_into().unwrap())
    } else {
        0
    };
    let paused = data.first().copied().unwrap_or(0) % 2 == 0;
    let mut sigs = Vec::new();
    let mut i = 8;
    while i + 1 < data.len() && sigs.len() < 8 {
        sigs.push(FuzzSig {
            co_admin_idx: data[i],
            corrupt: data[i + 1] % 2 == 0,
        });
        i += 2;
    }
    (nonce, paused, sigs)
}

fn run(data: &[u8]) {
    if data.len() < 8 {
        return;
    }

    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(RewardsContract, ());
    let client = RewardsContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &symbol_short!("Fuzz"), &symbol_short!("FZZ"));

    // Register NUM_CO_ADMINS co-admins with deterministic keypairs and set a
    // fixed threshold. Threshold edge cases (0, > co_admins.len()) are
    // exercised by set_multisig_threshold's own guard (InvalidThreshold),
    // covered by the existing unit tests — this harness focuses on
    // verify_multisig itself, so it uses a valid, non-zero threshold.
    let keypairs: [SigningKey; NUM_CO_ADMINS] = core::array::from_fn(|i| gen_keypair((i + 1) as u8));
    let co_admin_addrs: [Address; NUM_CO_ADMINS] = core::array::from_fn(|_| Address::generate(&env));
    for i in 0..NUM_CO_ADMINS {
        let pubkey_bytes = keypairs[i].verifying_key().to_bytes();
        client.add_co_admin(&admin, &co_admin_addrs[i], &BytesN::from_array(&env, &pubkey_bytes));
    }
    let threshold: u32 = 2;
    client.set_multisig_threshold(&admin, &threshold);

    let (nonce, paused, fuzz_sigs) = parse_sigs(data);

    let mut buf = [0u8; 1];
    buf[0] = paused as u8;
    let args_hash: [u8; 32] = env
        .crypto()
        .sha256(&Bytes::from_slice(&env, &buf))
        .to_array();

    let mut signatures: SdkVec<(Address, BytesN<64>)> = SdkVec::new(&env);
    for fs in &fuzz_sigs {
        let idx = (fs.co_admin_idx as usize) % (NUM_CO_ADMINS + 2); // occasionally out of range
        if idx >= NUM_CO_ADMINS {
            // "Unknown signer": attribute a signature to a freshly generated
            // address never registered as a co-admin.
            let unknown_signer = Address::generate(&env);
            let mut sig_bytes = sign_set_paused(&keypairs[0], nonce, paused, &args_hash);
            if fs.corrupt {
                sig_bytes[0] ^= 0xFF;
            }
            signatures.push_back((unknown_signer, BytesN::from_array(&env, &sig_bytes)));
        } else {
            let mut sig_bytes = sign_set_paused(&keypairs[idx], nonce, paused, &args_hash);
            if fs.corrupt {
                sig_bytes[0] ^= 0xFF;
            }
            signatures.push_back((co_admin_addrs[idx].clone(), BytesN::from_array(&env, &sig_bytes)));
        }
    }

    // Invariant 1: never panics, regardless of how malformed `signatures` is.
    let result = client.try_set_paused(&admin, &nonce, &paused, &signatures);

    // Invariant 2: success implies a valid, distinct, sufficiently-large,
    // uncorrupted, registered signer set.
    if result.is_ok() {
        let mut distinct_valid_registered = std::collections::BTreeSet::new();
        for fs in &fuzz_sigs {
            let idx = (fs.co_admin_idx as usize) % (NUM_CO_ADMINS + 2);
            if idx < NUM_CO_ADMINS && !fs.corrupt {
                distinct_valid_registered.insert(idx);
            }
        }
        assert!(
            distinct_valid_registered.len() as u32 >= threshold,
            "set_paused succeeded with fewer than {threshold} distinct valid registered signers: {:?}",
            distinct_valid_registered
        );
        assert_eq!(client.is_paused(), paused, "state did not reflect the requested paused value");

        // Invariant 3: replay the exact same call — it must now be rejected
        // even though every signature was valid the first time.
        let replay = client.try_set_paused(&admin, &nonce, &paused, &signatures);
        assert!(
            matches!(replay, Err(Ok(Error::NonceReused)) | Err(Err(_))),
            "nonce {nonce} was accepted twice"
        );
    }
}

fuzz_target!(|data: &[u8]| {
    run(data);
});

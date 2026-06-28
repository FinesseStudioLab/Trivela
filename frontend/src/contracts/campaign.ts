import { Buffer } from 'buffer';
import { Address } from '@stellar/stellar-sdk';
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from '@stellar/stellar-sdk/contract';
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from '@stellar/stellar-sdk/contract';
export * from '@stellar/stellar-sdk';
export * as contract from '@stellar/stellar-sdk/contract';
export * as rpc from '@stellar/stellar-sdk/rpc';

if (typeof window !== 'undefined') {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}

export const Errors = {
  100: { message: 'Unauthorized' },
  101: { message: 'OutsideTimeWindow' },
  102: { message: 'CapReached' },
  103: { message: 'CampaignInactive' },
  104: { message: 'NotInAllowlist' },
  105: { message: 'UnsupportedMigration' },
  106: { message: 'InvalidAdminNonce' },
  107: { message: 'InvalidWindow' },
  108: { message: 'NoPendingAdmin' },
  109: { message: 'SelfReferral' },
  110: { message: 'ReferrerNotRegistered' },
  /**
   * The campaign's privacy mode does not match the registration path used.
   */
  111: { message: 'InvalidPrivacyMode' },
  /**
   * The ZK proof is empty or malformed.
   */
  112: { message: 'InvalidProof' },
  /**
   * The nullifier has already been used for a registration in this campaign.
   */
  113: { message: 'NullifierAlreadyUsed' },
  114: { message: 'InviteCodeRequired' },
  115: { message: 'InvalidInviteCode' },
  116: { message: 'InviteAlreadyUsed' },
  117: { message: 'InviteNotFound' },
  118: { message: 'InvalidThreshold' },
  119: { message: 'InsufficientSignatures' },
  120: { message: 'NonceReused' },
  121: { message: 'DuplicateSigner' },
  122: { message: 'UnknownSigner' },
};

export enum PrivacyMode {
  None = 0,
  Merkle = 1,
  Zk = 2,
}

export type ActivityKind =
  | { tag: 'Register'; values: void }
  | { tag: 'Credit'; values: void }
  | { tag: 'Claim'; values: void };

export interface ActivityEntry {
  actor: string;
  amount: Option<u64>;
  kind: ActivityKind;
  ledger: u32;
}

export enum UniquenessMode {
  None = 0,
  Nullifier = 1,
}

export interface Client {
  /**
   * Construct and simulate a admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the current admin address.
   */
  admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;

  /**
   * Construct and simulate a migrate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Migration entrypoint for future schema transitions.
   *
   * For now, version `1` is the only supported schema and this function
   * serves as an idempotent migration hook for upgrade workflows.
   */
  migrate: (
    { admin, target_version }: { admin: string; target_version: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<u32>>>;

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Replace the contract WASM in-place without resetting participant state.
   *
   * Calls `contract_update_current_contract_wasm` with the supplied hash of
   * the new WASM blob (must already be uploaded via
   * `Env::deployer().upload_contract_wasm`).  Participant records in
   * persistent storage survive because Soroban WASM-only upgrades never
   * touch storage.  Requires admin auth and a valid nonce so upgrades are
   * replay-safe.
   *
   * Typical workflow (issue #518):
   * 1. Upload new WASM → obtain `new_wasm_hash`.
   * 2. Call `upgrade(admin, nonce, new_wasm_hash)`.
   * 3. If storage layout changed, call `migrate(admin, target_version)`.
   */
  upgrade: (
    { admin, nonce, new_wasm_hash }: { admin: string; nonce: u64; new_wasm_hash: Buffer },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a register transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Register a participant.
   *
   * `leaf`  – the 32-byte leaf value committed in the Merkle tree for this
   * participant.  Must be `sha256(address_xdr_bytes)` for the
   * caller's address, computed by off-chain tooling.
   *
   * `proof` – ordered list of sibling hashes for the Merkle path from
   * `leaf` to the stored root.  Pass an empty `Vec` when no root
   * is configured.
   *
   * `invite_code` – required when invite-only mode is enabled (see
   * [`Self::set_invite_only`]); `sha256(invite_code)` must match
   * a hash issued via [`Self::issue_invite`] that has not yet
   * been redeemed. Pass `None` when invite-only mode is off.
   *
   * `referrer` – optional address of an already-registered participant who
   * referred this registrant (issue #455). When supplied, the
   * contract records `(referee -> referrer)`, increments the
   * referrer's tally, and emits a `referred` event so the backend
   * indexer can credit the referral bonus trustlessly. A referrer
   * cannot refer themselves (`Error::SelfReferral`) and must
   * already be registered (`Error::ReferrerNotRegistered`).
   * Referr
   */
  register: (
    {
      participant,
      leaf,
      proof,
      invite_code,
      referrer,
    }: {
      participant: string;
      leaf: Buffer;
      proof: Array<Buffer>;
      invite_code: Option<Buffer>;
      referrer: Option<string>;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<boolean>>>;

  /**
   * Construct and simulate a is_active transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Check if campaign is active.
   */
  is_active: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;

  /**
   * Construct and simulate a deregister transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Deregister a participant.
   *
   * Checks liveness/window: if end_time is u64::MAX, checks if campaign is active;
   * otherwise, checks if current timestamp <= end_time.
   */
  deregister: (
    { participant }: { participant: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<boolean>>>;

  /**
   * Construct and simulate a get_window transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the configured `(start, end)` registration window.
   *
   * Defaults to `(0, u64::MAX)` when no window has been set, which
   * callers can interpret as "unbounded".
   */
  get_window: (options?: MethodOptions) => Promise<AssembledTransaction<readonly [u64, u64]>>;

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initialize campaign contract with an admin.
   */
  initialize: (
    { admin }: { admin: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a set_active transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set campaign active flag (admin only).
   */
  set_active: (
    { admin, nonce, active }: { admin: string; nonce: u64; active: boolean },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a set_window transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set registration time window (admin only).
   *
   * Both bounds are inclusive: `register` succeeds when
   * `start <= now <= end`. Use `0` and `u64::MAX` for an effectively
   * open window. Rejects `start > end` with `InvalidWindow`.
   */
  set_window: (
    { admin, nonce, start, end }: { admin: string; nonce: u64; start: u64; end: u64 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a admin_nonce transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the next required admin nonce for sensitive operations.
   */
  admin_nonce: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>;

  /**
   * Construct and simulate a get_max_cap transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get maximum participant cap (0 means unlimited).
   */
  get_max_cap: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>;

  /**
   * Construct and simulate a invite_used transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns whether the given invite hash has already been redeemed.
   */
  invite_used: (
    { invite_hash }: { invite_hash: Buffer },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<boolean>>;

  /**
   * Construct and simulate a referrer_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the referrer recorded for `participant` at registration, or
   * `None` if they registered without one (issue #455).
   */
  referrer_of: (
    { participant }: { participant: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Option<string>>>;

  /**
   * Construct and simulate a set_max_cap transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set maximum participant cap (admin only). Set to 0 for unlimited.
   */
  set_max_cap: (
    { admin, nonce, max_cap }: { admin: string; nonce: u64; max_cap: u64 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a accept_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Accept admin role. Caller MUST be the address that the current admin
   * previously proposed via `propose_admin`. Clears the pending slot on
   * success.
   */
  accept_admin: (
    { new_admin }: { new_admin: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a activity_log transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the activity log ring buffer in chronological order (oldest first).
   */
  activity_log: (options?: MethodOptions) => Promise<AssembledTransaction<Array<ActivityEntry>>>;

  /**
   * Construct and simulate a add_co_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Register a co-admin's ed25519 public key for multisig verification
   * (admin only). Overwrites the key if `co_admin` is already registered.
   */
  add_co_admin: (
    {
      admin,
      nonce,
      co_admin,
      pubkey,
    }: { admin: string; nonce: u64; co_admin: string; pubkey: Buffer },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a issue_invite transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Issue an invite by storing its hash (admin only). The hash should be
   * `sha256(invite_code)`, computed off-chain; the raw code is never
   * stored on-chain.
   */
  issue_invite: (
    { admin, nonce, invite_hash }: { admin: string; nonce: u64; invite_hash: Buffer },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a pending_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the pending admin address proposed by the current admin, if any.
   */
  pending_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>;

  /**
   * Construct and simulate a propose_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Propose a new admin (current admin only). The transfer does not take
   * effect until `accept_admin` is called by the new admin.
   */
  propose_admin: (
    { current_admin, new_admin }: { current_admin: string; new_admin: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a revoke_invite transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Revoke a previously issued invite (admin only).
   */
  revoke_invite: (
    { admin, nonce, invite_hash }: { admin: string; nonce: u64; invite_hash: Buffer },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a storage_stats transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Storage stats for monitoring: `(participant_count, nonce_count, expired_estimate)`.
   * `expired_estimate` counts `PARTICIPANT_REGISTRY` entries whose persistent
   * record is already gone (deregistered or TTL-archived) and awaiting prune.
   */
  storage_stats: (
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<readonly [u64, u64, u64]>>;

  /**
   * Construct and simulate a is_invite_only transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns whether invite-only registration mode is enabled.
   */
  is_invite_only: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;

  /**
   * Construct and simulate a is_participant transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Check if a participant is registered. (#280) Reads from
   * persistent storage where participant records live.
   */
  is_participant: (
    { participant }: { participant: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<boolean>>;

  /**
   * Construct and simulate a referral_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return how many participants registered with `referrer` as their
   * on-chain referrer (issue #455). Defaults to `0` for an address that
   * has never referred anyone.
   */
  referral_count: (
    { referrer }: { referrer: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<u64>>;

  /**
   * Construct and simulate a schema_version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the active storage schema version for this contract.
   */
  schema_version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>;

  /**
   * Construct and simulate a get_merkle_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the current Merkle root, or `None` when open registration is active.
   */
  get_merkle_root: (options?: MethodOptions) => Promise<AssembledTransaction<Option<Buffer>>>;

  /**
   * Construct and simulate a register_unique transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Register a participant with uniqueness proof (ZK unique registration).
   *
   * Alias for `register_private` that emphasizes the uniqueness guarantee
   * provided by the nullifier.
   */
  register_unique: (
    {
      participant,
      nullifier,
      proof,
      referrer,
    }: { participant: string; nullifier: Buffer; proof: Array<Buffer>; referrer: Option<string> },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<boolean>>>;

  /**
   * Construct and simulate a remove_co_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Remove a co-admin from the multisig signer set (admin only).
   */
  remove_co_admin: (
    { admin, nonce, co_admin }: { admin: string; nonce: u64; co_admin: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a set_invite_only transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Toggle invite-only registration mode (admin only).
   */
  set_invite_only: (
    { admin, nonce, enabled }: { admin: string; nonce: u64; enabled: boolean },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a set_merkle_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the Merkle root for allowlist-gated registration.
   *
   * Once set, every `register` call must supply a valid `(leaf, proof)`.
   * Remove the root by calling this again with a root of all zeros to
   * revert to open registration.
   *
   * This is a critical operation: when a multisig threshold is configured
   * (see [`Self::set_multisig_threshold`]), `signatures` must contain at
   * least `required` valid co-admin signatures over
   * `(op, nonce, sha256(root))`; otherwise pass an empty `Vec` and the
   * legacy single-admin nonce check applies.
   */
  set_merkle_root: (
    {
      admin,
      nonce,
      root,
      signatures,
    }: { admin: string; nonce: u64; root: Buffer; signatures: Array<readonly [string, Buffer]> },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a admin_deregister transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Deregister a participant by the admin.
   *
   * Bypasses time window and liveness checks. Requires admin auth and nonce validation.
   */
  admin_deregister: (
    { admin, nonce, participant }: { admin: string; nonce: u64; participant: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<boolean>>>;

  /**
   * Construct and simulate a get_privacy_mode transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current privacy mode.
   * Defaults to `PrivacyMode::None` (open) when not set.
   */
  get_privacy_mode: (options?: MethodOptions) => Promise<AssembledTransaction<PrivacyMode>>;

  /**
   * Construct and simulate a is_within_window transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns `true` when the current ledger timestamp is within
   * `[start, end]` of the configured window.
   *
   * Off-chain callers and dependent contracts (e.g. rewards logic)
   * can use this view to gate operations on campaign liveness without
   * duplicating the window check.
   */
  is_within_window: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;

  /**
   * Construct and simulate a register_private transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Register a participant using a ZK proof (private registration).
   *
   * Only callable when the campaign's privacy mode is `Zk`.
   * The `proof` field carries the ZK proof bytes; the contract verifies
   * that the proof is non-empty as a basic sanity check. Full on-chain
   * verification is out of scope (see NEW-001/002).
   *
   * Returns `true` on first registration, `false` if already registered.
   */
  register_private: (
    {
      participant,
      nullifier,
      proof,
      referrer,
    }: { participant: string; nullifier: Buffer; proof: Array<Buffer>; referrer: Option<string> },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<boolean>>>;

  /**
   * Construct and simulate a set_privacy_mode transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the privacy mode for this campaign (admin only).
   *
   * Controls which registration path is used:
   * - `None`: open registration, no proofs required.
   * - `Merkle`: standard Merkle allowlist registration.
   * - `Zk`: zero-knowledge proof registration (requires `register_private`).
   *
   * `fallback_allowed`: when true and the user's browser cannot prove in ZK
   * mode, the frontend may fall back to Merkle registration.
   */
  set_privacy_mode: (
    {
      admin,
      nonce,
      mode,
      fallback_allowed,
    }: { admin: string; nonce: u64; mode: PrivacyMode; fallback_allowed: boolean },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a prune_used_nonces transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Remove multisig nonce records older than [`NONCE_TTL_LEDGERS`], up to
   * `max_entries` per call. Callable by anyone since it only deletes
   * stale data. Returns the number of entries pruned.
   */
  prune_used_nonces: (
    { max_entries }: { max_entries: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<u32>>;

  /**
   * Construct and simulate a multisig_threshold transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the configured M-of-N multisig threshold (0 = disabled).
   */
  multisig_threshold: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>;

  /**
   * Construct and simulate a get_uniqueness_mode transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current uniqueness mode.
   * Defaults to `UniquenessMode::None` when not set.
   */
  get_uniqueness_mode: (options?: MethodOptions) => Promise<AssembledTransaction<UniquenessMode>>;

  /**
   * Construct and simulate a is_fallback_allowed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Check whether fallback to Merkle registration is allowed for ZK campaigns.
   */
  is_fallback_allowed: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;

  /**
   * Construct and simulate a set_uniqueness_mode transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the uniqueness mode for this campaign (admin only).
   *
   * Controls whether anti-sybil uniqueness is enforced:
   * - `None`: no uniqueness enforcement (current behavior).
   * - `Nullifier`: requires a nullifier registry proof for uniqueness.
   *
   * `registry_address` must be provided when setting `Nullifier` mode.
   */
  set_uniqueness_mode: (
    {
      admin,
      nonce,
      mode,
      registry_address,
    }: { admin: string; nonce: u64; mode: UniquenessMode; registry_address: Option<string> },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a cancel_admin_transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancel an in-flight admin transfer (current admin only).
   */
  cancel_admin_transfer: (
    { current_admin }: { current_admin: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a get_activity_log_size transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the configured activity log buffer size.
   */
  get_activity_log_size: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>;

  /**
   * Construct and simulate a get_participant_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get current participant count.
   */
  get_participant_count: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>;

  /**
   * Construct and simulate a set_activity_log_size transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the maximum size of the activity log ring buffer (admin only).
   * Must be between MIN_ACTIVITY_LOG_SIZE (10) and MAX_ACTIVITY_LOG_SIZE (200).
   */
  set_activity_log_size: (
    { admin, nonce, size }: { admin: string; nonce: u64; size: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a get_nullifier_registry transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the nullifier registry address, if configured.
   */
  get_nullifier_registry: (
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Option<string>>>;

  /**
   * Construct and simulate a set_multisig_threshold transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the M-of-N multisig threshold for critical operations (admin only).
   * `required = 0` disables multisig (legacy single-admin auth applies).
   */
  set_multisig_threshold: (
    { admin, nonce, required }: { admin: string; nonce: u64; required: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a register_with_uniqueness transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Register a participant with uniqueness proof (anti-sybil).
   *
   * When the campaign's uniqueness mode is `Nullifier`, this function:
   * 1. Verifies the nullifier has not been spent via the nullifier registry.
   * 2. Spends the nullifier to prevent double-registration.
   *
   * The `uniqueness_proof` is passed through to the registry for
   * future verification. For now, it's stored alongside the nullifier.
   *
   * Returns `true` on first registration, `false` if already registered.
   */
  register_with_uniqueness: (
    {
      participant,
      nullifier,
      uniqueness_proof,
    }: { participant: string; nullifier: Buffer; uniqueness_proof: Buffer },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<boolean>>>;

  /**
   * Construct and simulate a prune_expired_participants transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Garbage-collect `PARTICIPANT_REGISTRY` entries whose persistent
   * participant record is gone — either explicitly deregistered, or
   * archived by the network after its TTL lapsed (#280) — up to
   * `max_entries` per call. Callable by anyone since it only deletes
   * stale bookkeeping, never live data. Returns the number pruned.
   *
   * Uses swap-remove so each pruned entry is O(1); a persisted cursor
   * lets repeated calls sweep the whole registry over time without
   * rescanning from the start, bounding work per call.
   */
  prune_expired_participants: (
    { max_entries }: { max_entries: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<u32>>;
}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, 'contractId'> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: 'hex' | 'base64';
      },
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options);
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([
        'AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAFwAAAAAAAAAMVW5hdXRob3JpemVkAAAAZAAAAAAAAAART3V0c2lkZVRpbWVXaW5kb3cAAAAAAABlAAAAAAAAAApDYXBSZWFjaGVkAAAAAABmAAAAAAAAABBDYW1wYWlnbkluYWN0aXZlAAAAZwAAAAAAAAAOTm90SW5BbGxvd2xpc3QAAAAAAGgAAAAAAAAAFFVuc3VwcG9ydGVkTWlncmF0aW9uAAAAaQAAAAAAAAARSW52YWxpZEFkbWluTm9uY2UAAAAAAABqAAAAAAAAAA1JbnZhbGlkV2luZG93AAAAAAAAawAAAAAAAAAOTm9QZW5kaW5nQWRtaW4AAAAAAGwAAAAAAAAADFNlbGZSZWZlcnJhbAAAAG0AAAAAAAAAFVJlZmVycmVyTm90UmVnaXN0ZXJlZAAAAAAAAG4AAABGVGhlIGNhbXBhaWduJ3MgcHJpdmFjeSBtb2RlIGRvZXMgbm90IG1hdGNoIHRoZSByZWdpc3RyYXRpb24gcGF0aCB1c2VkLgAAAAAAEkludmFsaWRQcml2YWN5TW9kZQAAAAAAbwAAACNUaGUgWksgcHJvb2YgaXMgZW1wdHkgb3IgbWFsZm9ybWVkLgAAAAAMSW52YWxpZFByb29mAAAAcAAAAEhUaGUgbnVsbGlmaWVyIGhhcyBhbHJlYWR5IGJlZW4gdXNlZCBmb3IgYSByZWdpc3RyYXRpb24gaW4gdGhpcyBjYW1wYWlnbi4AAAAUTnVsbGlmaWVyQWxyZWFkeVVzZWQAAABxAAAAAAAAABJJbnZpdGVDb2RlUmVxdWlyZWQAAAAAAHIAAAAAAAAAEUludmFsaWRJbnZpdGVDb2RlAAAAAAAAcwAAAAAAAAARSW52aXRlQWxyZWFkeVVzZWQAAAAAAAB0AAAAAAAAAA5JbnZpdGVOb3RGb3VuZAAAAAAAdQAAAAAAAAAQSW52YWxpZFRocmVzaG9sZAAAAHYAAAAAAAAAFkluc3VmZmljaWVudFNpZ25hdHVyZXMAAAAAAHcAAAAAAAAAC05vbmNlUmV1c2VkAAAAAHgAAAAAAAAAD0R1cGxpY2F0ZVNpZ25lcgAAAAB5AAAAAAAAAA1Vbmtub3duU2lnbmVyAAAAAAAAeg==',
        'AAAAAwAAAAAAAAAAAAAAC1ByaXZhY3lNb2RlAAAAAAMAAAApT3BlbiByZWdpc3RyYXRpb24g4oCUIG5vIHByb29mcyByZXF1aXJlZC4AAAAAAAAETm9uZQAAAAAAAAA4TWVya2xlIGFsbG93bGlzdCDigJQgc3RhbmRhcmQgbGVhZiArIHByb29mIHJlZ2lzdHJhdGlvbi4AAAAGTWVya2xlAAAAAAABAAAANFpLIHJlZ2lzdHJhdGlvbiDigJQgcmVxdWlyZXMgYSB6ZXJvLWtub3dsZWRnZSBwcm9vZi4AAAACWmsAAAAAAAI=',
        'AAAAAgAAAAAAAAAAAAAADEFjdGl2aXR5S2luZAAAAAMAAAAAAAAAAAAAAAhSZWdpc3RlcgAAAAAAAAAAAAAABkNyZWRpdAAAAAAAAAAAAAAAAAAFQ2xhaW0AAAA=',
        'AAAAAQAAAAAAAAAAAAAADUFjdGl2aXR5RW50cnkAAAAAAAAEAAAAAAAAAAVhY3RvcgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAD6AAAAAYAAAAAAAAABGtpbmQAAAfQAAAADEFjdGl2aXR5S2luZAAAAAAAAAAGbGVkZ2VyAAAAAAAE',
        'AAAAAwAAAAAAAAAAAAAADlVuaXF1ZW5lc3NNb2RlAAAAAAACAAAAL05vIHVuaXF1ZW5lc3MgZW5mb3JjZW1lbnQg4oCUIGN1cnJlbnQgYmVoYXZpb3IuAAAAAAROb25lAAAAAAAAAD1OdWxsaWZpZXItYmFzZWQgdW5pcXVlbmVzcyDigJQgb25lIGVudHJ5IHBlciB1bmlxdWUgaWRlbnRpdHkuAAAAAAAACU51bGxpZmllcgAAAAAAAAE=',
        'AAAAAAAAACFSZXR1cm4gdGhlIGN1cnJlbnQgYWRtaW4gYWRkcmVzcy4AAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAABM=',
        'AAAAAAAAALZNaWdyYXRpb24gZW50cnlwb2ludCBmb3IgZnV0dXJlIHNjaGVtYSB0cmFuc2l0aW9ucy4KCkZvciBub3csIHZlcnNpb24gYDFgIGlzIHRoZSBvbmx5IHN1cHBvcnRlZCBzY2hlbWEgYW5kIHRoaXMgZnVuY3Rpb24Kc2VydmVzIGFzIGFuIGlkZW1wb3RlbnQgbWlncmF0aW9uIGhvb2sgZm9yIHVwZ3JhZGUgd29ya2Zsb3dzLgAAAAAAB21pZ3JhdGUAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAA50YXJnZXRfdmVyc2lvbgAAAAAABAAAAAEAAAPpAAAABAAAAAM=',
        'AAAAAAAAAlxSZXBsYWNlIHRoZSBjb250cmFjdCBXQVNNIGluLXBsYWNlIHdpdGhvdXQgcmVzZXR0aW5nIHBhcnRpY2lwYW50IHN0YXRlLgoKQ2FsbHMgYGNvbnRyYWN0X3VwZGF0ZV9jdXJyZW50X2NvbnRyYWN0X3dhc21gIHdpdGggdGhlIHN1cHBsaWVkIGhhc2ggb2YKdGhlIG5ldyBXQVNNIGJsb2IgKG11c3QgYWxyZWFkeSBiZSB1cGxvYWRlZCB2aWEKYEVudjo6ZGVwbG95ZXIoKS51cGxvYWRfY29udHJhY3Rfd2FzbWApLiAgUGFydGljaXBhbnQgcmVjb3JkcyBpbgpwZXJzaXN0ZW50IHN0b3JhZ2Ugc3Vydml2ZSBiZWNhdXNlIFNvcm9iYW4gV0FTTS1vbmx5IHVwZ3JhZGVzIG5ldmVyCnRvdWNoIHN0b3JhZ2UuICBSZXF1aXJlcyBhZG1pbiBhdXRoIGFuZCBhIHZhbGlkIG5vbmNlIHNvIHVwZ3JhZGVzIGFyZQpyZXBsYXktc2FmZS4KClR5cGljYWwgd29ya2Zsb3cgKGlzc3VlICM1MTgpOgoxLiBVcGxvYWQgbmV3IFdBU00g4oaSIG9idGFpbiBgbmV3X3dhc21faGFzaGAuCjIuIENhbGwgYHVwZ3JhZGUoYWRtaW4sIG5vbmNlLCBuZXdfd2FzbV9oYXNoKWAuCjMuIElmIHN0b3JhZ2UgbGF5b3V0IGNoYW5nZWQsIGNhbGwgYG1pZ3JhdGUoYWRtaW4sIHRhcmdldF92ZXJzaW9uKWAuAAAAB3VwZ3JhZGUAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAVub25jZQAAAAAAAAYAAAAAAAAADW5ld193YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAABABSZWdpc3RlciBhIHBhcnRpY2lwYW50LgoKYGxlYWZgICDigJMgdGhlIDMyLWJ5dGUgbGVhZiB2YWx1ZSBjb21taXR0ZWQgaW4gdGhlIE1lcmtsZSB0cmVlIGZvciB0aGlzCnBhcnRpY2lwYW50LiAgTXVzdCBiZSBgc2hhMjU2KGFkZHJlc3NfeGRyX2J5dGVzKWAgZm9yIHRoZQpjYWxsZXIncyBhZGRyZXNzLCBjb21wdXRlZCBieSBvZmYtY2hhaW4gdG9vbGluZy4KCmBwcm9vZmAg4oCTIG9yZGVyZWQgbGlzdCBvZiBzaWJsaW5nIGhhc2hlcyBmb3IgdGhlIE1lcmtsZSBwYXRoIGZyb20KYGxlYWZgIHRvIHRoZSBzdG9yZWQgcm9vdC4gIFBhc3MgYW4gZW1wdHkgYFZlY2Agd2hlbiBubyByb290CmlzIGNvbmZpZ3VyZWQuCgpgaW52aXRlX2NvZGVgIOKAkyByZXF1aXJlZCB3aGVuIGludml0ZS1vbmx5IG1vZGUgaXMgZW5hYmxlZCAoc2VlCltgU2VsZjo6c2V0X2ludml0ZV9vbmx5YF0pOyBgc2hhMjU2KGludml0ZV9jb2RlKWAgbXVzdCBtYXRjaAphIGhhc2ggaXNzdWVkIHZpYSBbYFNlbGY6Omlzc3VlX2ludml0ZWBdIHRoYXQgaGFzIG5vdCB5ZXQKYmVlbiByZWRlZW1lZC4gUGFzcyBgTm9uZWAgd2hlbiBpbnZpdGUtb25seSBtb2RlIGlzIG9mZi4KCmByZWZlcnJlcmAg4oCTIG9wdGlvbmFsIGFkZHJlc3Mgb2YgYW4gYWxyZWFkeS1yZWdpc3RlcmVkIHBhcnRpY2lwYW50IHdobwpyZWZlcnJlZCB0aGlzIHJlZ2lzdHJhbnQgKGlzc3VlICM0NTUpLiBXaGVuIHN1cHBsaWVkLCB0aGUKY29udHJhY3QgcmVjb3JkcyBgKHJlZmVyZWUgLT4gcmVmZXJyZXIpYCwgaW5jcmVtZW50cyB0aGUKcmVmZXJyZXIncyB0YWxseSwgYW5kIGVtaXRzIGEgYHJlZmVycmVkYCBldmVudCBzbyB0aGUgYmFja2VuZAppbmRleGVyIGNhbiBjcmVkaXQgdGhlIHJlZmVycmFsIGJvbnVzIHRydXN0bGVzc2x5LiBBIHJlZmVycmVyCmNhbm5vdCByZWZlciB0aGVtc2VsdmVzIChgRXJyb3I6OlNlbGZSZWZlcnJhbGApIGFuZCBtdXN0CmFscmVhZHkgYmUgcmVnaXN0ZXJlZCAoYEVycm9yOjpSZWZlcnJlck5vdFJlZ2lzdGVyZWRgKS4KUmVmZXJyAAAACHJlZ2lzdGVyAAAABQAAAAAAAAALcGFydGljaXBhbnQAAAAAEwAAAAAAAAAEbGVhZgAAA+4AAAAgAAAAAAAAAAVwcm9vZgAAAAAAA+oAAAPuAAAAIAAAAAAAAAALaW52aXRlX2NvZGUAAAAD6AAAAA4AAAAAAAAACHJlZmVycmVyAAAD6AAAABMAAAABAAAD6QAAAAEAAAAD',
        'AAAAAAAAABxDaGVjayBpZiBjYW1wYWlnbiBpcyBhY3RpdmUuAAAACWlzX2FjdGl2ZQAAAAAAAAAAAAABAAAAAQ==',
        'AAAAAAAAAJ1EZXJlZ2lzdGVyIGEgcGFydGljaXBhbnQuCgpDaGVja3MgbGl2ZW5lc3Mvd2luZG93OiBpZiBlbmRfdGltZSBpcyB1NjQ6Ok1BWCwgY2hlY2tzIGlmIGNhbXBhaWduIGlzIGFjdGl2ZTsKb3RoZXJ3aXNlLCBjaGVja3MgaWYgY3VycmVudCB0aW1lc3RhbXAgPD0gZW5kX3RpbWUuAAAAAAAACmRlcmVnaXN0ZXIAAAAAAAEAAAAAAAAAC3BhcnRpY2lwYW50AAAAABMAAAABAAAD6QAAAAEAAAAD',
        'AAAAAAAAAJxHZXQgdGhlIGNvbmZpZ3VyZWQgYChzdGFydCwgZW5kKWAgcmVnaXN0cmF0aW9uIHdpbmRvdy4KCkRlZmF1bHRzIHRvIGAoMCwgdTY0OjpNQVgpYCB3aGVuIG5vIHdpbmRvdyBoYXMgYmVlbiBzZXQsIHdoaWNoCmNhbGxlcnMgY2FuIGludGVycHJldCBhcyAidW5ib3VuZGVkIi4AAAAKZ2V0X3dpbmRvdwAAAAAAAAAAAAEAAAPtAAAAAgAAAAYAAAAG',
        'AAAAAAAAACtJbml0aWFsaXplIGNhbXBhaWduIGNvbnRyYWN0IHdpdGggYW4gYWRtaW4uAAAAAAppbml0aWFsaXplAAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAACZTZXQgY2FtcGFpZ24gYWN0aXZlIGZsYWcgKGFkbWluIG9ubHkpLgAAAAAACnNldF9hY3RpdmUAAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAFbm9uY2UAAAAAAAAGAAAAAAAAAAZhY3RpdmUAAAAAAAEAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAANlTZXQgcmVnaXN0cmF0aW9uIHRpbWUgd2luZG93IChhZG1pbiBvbmx5KS4KCkJvdGggYm91bmRzIGFyZSBpbmNsdXNpdmU6IGByZWdpc3RlcmAgc3VjY2VlZHMgd2hlbgpgc3RhcnQgPD0gbm93IDw9IGVuZGAuIFVzZSBgMGAgYW5kIGB1NjQ6Ok1BWGAgZm9yIGFuIGVmZmVjdGl2ZWx5Cm9wZW4gd2luZG93LiBSZWplY3RzIGBzdGFydCA+IGVuZGAgd2l0aCBgSW52YWxpZFdpbmRvd2AuAAAAAAAACnNldF93aW5kb3cAAAAAAAQAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAFbm9uY2UAAAAAAAAGAAAAAAAAAAVzdGFydAAAAAAAAAYAAAAAAAAAA2VuZAAAAAAGAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAADtHZXQgdGhlIG5leHQgcmVxdWlyZWQgYWRtaW4gbm9uY2UgZm9yIHNlbnNpdGl2ZSBvcGVyYXRpb25zLgAAAAALYWRtaW5fbm9uY2UAAAAAAAAAAAEAAAAG',
        'AAAAAAAAADBHZXQgbWF4aW11bSBwYXJ0aWNpcGFudCBjYXAgKDAgbWVhbnMgdW5saW1pdGVkKS4AAAALZ2V0X21heF9jYXAAAAAAAAAAAAEAAAAG',
        'AAAAAAAAAEBSZXR1cm5zIHdoZXRoZXIgdGhlIGdpdmVuIGludml0ZSBoYXNoIGhhcyBhbHJlYWR5IGJlZW4gcmVkZWVtZWQuAAAAC2ludml0ZV91c2VkAAAAAAEAAAAAAAAAC2ludml0ZV9oYXNoAAAAA+4AAAAgAAAAAQAAAAE=',
        'AAAAAAAAAHZSZXR1cm4gdGhlIHJlZmVycmVyIHJlY29yZGVkIGZvciBgcGFydGljaXBhbnRgIGF0IHJlZ2lzdHJhdGlvbiwgb3IKYE5vbmVgIGlmIHRoZXkgcmVnaXN0ZXJlZCB3aXRob3V0IG9uZSAoaXNzdWUgIzQ1NSkuAAAAAAALcmVmZXJyZXJfb2YAAAAAAQAAAAAAAAALcGFydGljaXBhbnQAAAAAEwAAAAEAAAPoAAAAEw==',
        'AAAAAAAAAEFTZXQgbWF4aW11bSBwYXJ0aWNpcGFudCBjYXAgKGFkbWluIG9ubHkpLiBTZXQgdG8gMCBmb3IgdW5saW1pdGVkLgAAAAAAAAtzZXRfbWF4X2NhcAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABW5vbmNlAAAAAAAABgAAAAAAAAAHbWF4X2NhcAAAAAAGAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAAJFBY2NlcHQgYWRtaW4gcm9sZS4gQ2FsbGVyIE1VU1QgYmUgdGhlIGFkZHJlc3MgdGhhdCB0aGUgY3VycmVudCBhZG1pbgpwcmV2aW91c2x5IHByb3Bvc2VkIHZpYSBgcHJvcG9zZV9hZG1pbmAuIENsZWFycyB0aGUgcGVuZGluZyBzbG90IG9uCnN1Y2Nlc3MuAAAAAAAADGFjY2VwdF9hZG1pbgAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAAEpSZXR1cm4gdGhlIGFjdGl2aXR5IGxvZyByaW5nIGJ1ZmZlciBpbiBjaHJvbm9sb2dpY2FsIG9yZGVyIChvbGRlc3QgZmlyc3QpLgAAAAAADGFjdGl2aXR5X2xvZwAAAAAAAAABAAAD6gAAB9AAAAANQWN0aXZpdHlFbnRyeQAAAA==',
        'AAAAAAAAAIhSZWdpc3RlciBhIGNvLWFkbWluJ3MgZWQyNTUxOSBwdWJsaWMga2V5IGZvciBtdWx0aXNpZyB2ZXJpZmljYXRpb24KKGFkbWluIG9ubHkpLiBPdmVyd3JpdGVzIHRoZSBrZXkgaWYgYGNvX2FkbWluYCBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQuAAAADGFkZF9jb19hZG1pbgAAAAQAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAFbm9uY2UAAAAAAAAGAAAAAAAAAAhjb19hZG1pbgAAABMAAAAAAAAABnB1YmtleQAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAAJZJc3N1ZSBhbiBpbnZpdGUgYnkgc3RvcmluZyBpdHMgaGFzaCAoYWRtaW4gb25seSkuIFRoZSBoYXNoIHNob3VsZCBiZQpgc2hhMjU2KGludml0ZV9jb2RlKWAsIGNvbXB1dGVkIG9mZi1jaGFpbjsgdGhlIHJhdyBjb2RlIGlzIG5ldmVyCnN0b3JlZCBvbi1jaGFpbi4AAAAAAAxpc3N1ZV9pbnZpdGUAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABW5vbmNlAAAAAAAABgAAAAAAAAALaW52aXRlX2hhc2gAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAAEdSZXR1cm4gdGhlIHBlbmRpbmcgYWRtaW4gYWRkcmVzcyBwcm9wb3NlZCBieSB0aGUgY3VycmVudCBhZG1pbiwgaWYgYW55LgAAAAANcGVuZGluZ19hZG1pbgAAAAAAAAAAAAABAAAD6AAAABM=',
        'AAAAAAAAAHxQcm9wb3NlIGEgbmV3IGFkbWluIChjdXJyZW50IGFkbWluIG9ubHkpLiBUaGUgdHJhbnNmZXIgZG9lcyBub3QgdGFrZQplZmZlY3QgdW50aWwgYGFjY2VwdF9hZG1pbmAgaXMgY2FsbGVkIGJ5IHRoZSBuZXcgYWRtaW4uAAAADXByb3Bvc2VfYWRtaW4AAAAAAAACAAAAAAAAAA1jdXJyZW50X2FkbWluAAAAAAAAEwAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAAC9SZXZva2UgYSBwcmV2aW91c2x5IGlzc3VlZCBpbnZpdGUgKGFkbWluIG9ubHkpLgAAAAANcmV2b2tlX2ludml0ZQAAAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAFbm9uY2UAAAAAAAAGAAAAAAAAAAtpbnZpdGVfaGFzaAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAAOdTdG9yYWdlIHN0YXRzIGZvciBtb25pdG9yaW5nOiBgKHBhcnRpY2lwYW50X2NvdW50LCBub25jZV9jb3VudCwgZXhwaXJlZF9lc3RpbWF0ZSlgLgpgZXhwaXJlZF9lc3RpbWF0ZWAgY291bnRzIGBQQVJUSUNJUEFOVF9SRUdJU1RSWWAgZW50cmllcyB3aG9zZSBwZXJzaXN0ZW50CnJlY29yZCBpcyBhbHJlYWR5IGdvbmUgKGRlcmVnaXN0ZXJlZCBvciBUVEwtYXJjaGl2ZWQpIGFuZCBhd2FpdGluZyBwcnVuZS4AAAAADXN0b3JhZ2Vfc3RhdHMAAAAAAAAAAAAAAQAAA+0AAAADAAAABgAAAAYAAAAG',
        'AAAAAAAAADlSZXR1cm5zIHdoZXRoZXIgaW52aXRlLW9ubHkgcmVnaXN0cmF0aW9uIG1vZGUgaXMgZW5hYmxlZC4AAAAAAAAOaXNfaW52aXRlX29ubHkAAAAAAAAAAAABAAAAAQ==',
        'AAAAAAAAAGpDaGVjayBpZiBhIHBhcnRpY2lwYW50IGlzIHJlZ2lzdGVyZWQuICgjMjgwKSBSZWFkcyBmcm9tCnBlcnNpc3RlbnQgc3RvcmFnZSB3aGVyZSBwYXJ0aWNpcGFudCByZWNvcmRzIGxpdmUuAAAAAAAOaXNfcGFydGljaXBhbnQAAAAAAAEAAAAAAAAAC3BhcnRpY2lwYW50AAAAABMAAAABAAAAAQ==',
        'AAAAAAAAAJ9SZXR1cm4gaG93IG1hbnkgcGFydGljaXBhbnRzIHJlZ2lzdGVyZWQgd2l0aCBgcmVmZXJyZXJgIGFzIHRoZWlyCm9uLWNoYWluIHJlZmVycmVyIChpc3N1ZSAjNDU1KS4gRGVmYXVsdHMgdG8gYDBgIGZvciBhbiBhZGRyZXNzIHRoYXQKaGFzIG5ldmVyIHJlZmVycmVkIGFueW9uZS4AAAAADnJlZmVycmFsX2NvdW50AAAAAAABAAAAAAAAAAhyZWZlcnJlcgAAABMAAAABAAAABg==',
        'AAAAAAAAADxSZXR1cm5zIHRoZSBhY3RpdmUgc3RvcmFnZSBzY2hlbWEgdmVyc2lvbiBmb3IgdGhpcyBjb250cmFjdC4AAAAOc2NoZW1hX3ZlcnNpb24AAAAAAAAAAAABAAAABA==',
        'AAAAAAAAAEtSZXR1cm4gdGhlIGN1cnJlbnQgTWVya2xlIHJvb3QsIG9yIGBOb25lYCB3aGVuIG9wZW4gcmVnaXN0cmF0aW9uIGlzIGFjdGl2ZS4AAAAAD2dldF9tZXJrbGVfcm9vdAAAAAAAAAAAAQAAA+gAAAPuAAAAIA==',
        'AAAAAAAAAKhSZWdpc3RlciBhIHBhcnRpY2lwYW50IHdpdGggdW5pcXVlbmVzcyBwcm9vZiAoWksgdW5pcXVlIHJlZ2lzdHJhdGlvbikuCgpBbGlhcyBmb3IgYHJlZ2lzdGVyX3ByaXZhdGVgIHRoYXQgZW1waGFzaXplcyB0aGUgdW5pcXVlbmVzcyBndWFyYW50ZWUKcHJvdmlkZWQgYnkgdGhlIG51bGxpZmllci4AAAAPcmVnaXN0ZXJfdW5pcXVlAAAAAAQAAAAAAAAAC3BhcnRpY2lwYW50AAAAABMAAAAAAAAACW51bGxpZmllcgAAAAAAA+4AAAAgAAAAAAAAAAVwcm9vZgAAAAAAA+oAAAPuAAAAIAAAAAAAAAAIcmVmZXJyZXIAAAPoAAAAEwAAAAEAAAPpAAAAAQAAAAM=',
        'AAAAAAAAADxSZW1vdmUgYSBjby1hZG1pbiBmcm9tIHRoZSBtdWx0aXNpZyBzaWduZXIgc2V0IChhZG1pbiBvbmx5KS4AAAAPcmVtb3ZlX2NvX2FkbWluAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAFbm9uY2UAAAAAAAAGAAAAAAAAAAhjb19hZG1pbgAAABMAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAADJUb2dnbGUgaW52aXRlLW9ubHkgcmVnaXN0cmF0aW9uIG1vZGUgKGFkbWluIG9ubHkpLgAAAAAAD3NldF9pbnZpdGVfb25seQAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABW5vbmNlAAAAAAAABgAAAAAAAAAHZW5hYmxlZAAAAAABAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAAgJTZXQgdGhlIE1lcmtsZSByb290IGZvciBhbGxvd2xpc3QtZ2F0ZWQgcmVnaXN0cmF0aW9uLgoKT25jZSBzZXQsIGV2ZXJ5IGByZWdpc3RlcmAgY2FsbCBtdXN0IHN1cHBseSBhIHZhbGlkIGAobGVhZiwgcHJvb2YpYC4KUmVtb3ZlIHRoZSByb290IGJ5IGNhbGxpbmcgdGhpcyBhZ2FpbiB3aXRoIGEgcm9vdCBvZiBhbGwgemVyb3MgdG8KcmV2ZXJ0IHRvIG9wZW4gcmVnaXN0cmF0aW9uLgoKVGhpcyBpcyBhIGNyaXRpY2FsIG9wZXJhdGlvbjogd2hlbiBhIG11bHRpc2lnIHRocmVzaG9sZCBpcyBjb25maWd1cmVkCihzZWUgW2BTZWxmOjpzZXRfbXVsdGlzaWdfdGhyZXNob2xkYF0pLCBgc2lnbmF0dXJlc2AgbXVzdCBjb250YWluIGF0CmxlYXN0IGByZXF1aXJlZGAgdmFsaWQgY28tYWRtaW4gc2lnbmF0dXJlcyBvdmVyCmAob3AsIG5vbmNlLCBzaGEyNTYocm9vdCkpYDsgb3RoZXJ3aXNlIHBhc3MgYW4gZW1wdHkgYFZlY2AgYW5kIHRoZQpsZWdhY3kgc2luZ2xlLWFkbWluIG5vbmNlIGNoZWNrIGFwcGxpZXMuAAAAAAAPc2V0X21lcmtsZV9yb290AAAAAAQAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAFbm9uY2UAAAAAAAAGAAAAAAAAAARyb290AAAD7gAAACAAAAAAAAAACnNpZ25hdHVyZXMAAAAAA+oAAAPtAAAAAgAAABMAAAPuAAAAQAAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAAHtEZXJlZ2lzdGVyIGEgcGFydGljaXBhbnQgYnkgdGhlIGFkbWluLgoKQnlwYXNzZXMgdGltZSB3aW5kb3cgYW5kIGxpdmVuZXNzIGNoZWNrcy4gUmVxdWlyZXMgYWRtaW4gYXV0aCBhbmQgbm9uY2UgdmFsaWRhdGlvbi4AAAAAEGFkbWluX2RlcmVnaXN0ZXIAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABW5vbmNlAAAAAAAABgAAAAAAAAALcGFydGljaXBhbnQAAAAAEwAAAAEAAAPpAAAAAQAAAAM=',
        'AAAAAAAAAFJHZXQgdGhlIGN1cnJlbnQgcHJpdmFjeSBtb2RlLgpEZWZhdWx0cyB0byBgUHJpdmFjeU1vZGU6Ok5vbmVgIChvcGVuKSB3aGVuIG5vdCBzZXQuAAAAAAAQZ2V0X3ByaXZhY3lfbW9kZQAAAAAAAAABAAAH0AAAAAtQcml2YWN5TW9kZQA=',
        'AAAAAAAAAQNSZXR1cm5zIGB0cnVlYCB3aGVuIHRoZSBjdXJyZW50IGxlZGdlciB0aW1lc3RhbXAgaXMgd2l0aGluCmBbc3RhcnQsIGVuZF1gIG9mIHRoZSBjb25maWd1cmVkIHdpbmRvdy4KCk9mZi1jaGFpbiBjYWxsZXJzIGFuZCBkZXBlbmRlbnQgY29udHJhY3RzIChlLmcuIHJld2FyZHMgbG9naWMpCmNhbiB1c2UgdGhpcyB2aWV3IHRvIGdhdGUgb3BlcmF0aW9ucyBvbiBjYW1wYWlnbiBsaXZlbmVzcyB3aXRob3V0CmR1cGxpY2F0aW5nIHRoZSB3aW5kb3cgY2hlY2suAAAAABBpc193aXRoaW5fd2luZG93AAAAAAAAAAEAAAAB',
        'AAAAAAAAAXVSZWdpc3RlciBhIHBhcnRpY2lwYW50IHVzaW5nIGEgWksgcHJvb2YgKHByaXZhdGUgcmVnaXN0cmF0aW9uKS4KCk9ubHkgY2FsbGFibGUgd2hlbiB0aGUgY2FtcGFpZ24ncyBwcml2YWN5IG1vZGUgaXMgYFprYC4KVGhlIGBwcm9vZmAgZmllbGQgY2FycmllcyB0aGUgWksgcHJvb2YgYnl0ZXM7IHRoZSBjb250cmFjdCB2ZXJpZmllcwp0aGF0IHRoZSBwcm9vZiBpcyBub24tZW1wdHkgYXMgYSBiYXNpYyBzYW5pdHkgY2hlY2suIEZ1bGwgb24tY2hhaW4KdmVyaWZpY2F0aW9uIGlzIG91dCBvZiBzY29wZSAoc2VlIE5FVy0wMDEvMDAyKS4KClJldHVybnMgYHRydWVgIG9uIGZpcnN0IHJlZ2lzdHJhdGlvbiwgYGZhbHNlYCBpZiBhbHJlYWR5IHJlZ2lzdGVyZWQuAAAAAAAAEHJlZ2lzdGVyX3ByaXZhdGUAAAAEAAAAAAAAAAtwYXJ0aWNpcGFudAAAAAATAAAAAAAAAAludWxsaWZpZXIAAAAAAAPuAAAAIAAAAAAAAAAFcHJvb2YAAAAAAAPqAAAD7gAAACAAAAAAAAAACHJlZmVycmVyAAAD6AAAABMAAAABAAAD6QAAAAEAAAAD',
        'AAAAAAAAAY9TZXQgdGhlIHByaXZhY3kgbW9kZSBmb3IgdGhpcyBjYW1wYWlnbiAoYWRtaW4gb25seSkuCgpDb250cm9scyB3aGljaCByZWdpc3RyYXRpb24gcGF0aCBpcyB1c2VkOgotIGBOb25lYDogb3BlbiByZWdpc3RyYXRpb24sIG5vIHByb29mcyByZXF1aXJlZC4KLSBgTWVya2xlYDogc3RhbmRhcmQgTWVya2xlIGFsbG93bGlzdCByZWdpc3RyYXRpb24uCi0gYFprYDogemVyby1rbm93bGVkZ2UgcHJvb2YgcmVnaXN0cmF0aW9uIChyZXF1aXJlcyBgcmVnaXN0ZXJfcHJpdmF0ZWApLgoKYGZhbGxiYWNrX2FsbG93ZWRgOiB3aGVuIHRydWUgYW5kIHRoZSB1c2VyJ3MgYnJvd3NlciBjYW5ub3QgcHJvdmUgaW4gWksKbW9kZSwgdGhlIGZyb250ZW5kIG1heSBmYWxsIGJhY2sgdG8gTWVya2xlIHJlZ2lzdHJhdGlvbi4AAAAAEHNldF9wcml2YWN5X21vZGUAAAAEAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABW5vbmNlAAAAAAAABgAAAAAAAAAEbW9kZQAAB9AAAAALUHJpdmFjeU1vZGUAAAAAAAAAABBmYWxsYmFja19hbGxvd2VkAAAAAQAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAALhSZW1vdmUgbXVsdGlzaWcgbm9uY2UgcmVjb3JkcyBvbGRlciB0aGFuIFtgTk9OQ0VfVFRMX0xFREdFUlNgXSwgdXAgdG8KYG1heF9lbnRyaWVzYCBwZXIgY2FsbC4gQ2FsbGFibGUgYnkgYW55b25lIHNpbmNlIGl0IG9ubHkgZGVsZXRlcwpzdGFsZSBkYXRhLiBSZXR1cm5zIHRoZSBudW1iZXIgb2YgZW50cmllcyBwcnVuZWQuAAAAEXBydW5lX3VzZWRfbm9uY2VzAAAAAAAAAQAAAAAAAAALbWF4X2VudHJpZXMAAAAABAAAAAEAAAAE',
        'AAAAAAAAAEBSZXR1cm5zIHRoZSBjb25maWd1cmVkIE0tb2YtTiBtdWx0aXNpZyB0aHJlc2hvbGQgKDAgPSBkaXNhYmxlZCkuAAAAEm11bHRpc2lnX3RocmVzaG9sZAAAAAAAAAAAAAEAAAAE',
        'AAAAAAAAAFFHZXQgdGhlIGN1cnJlbnQgdW5pcXVlbmVzcyBtb2RlLgpEZWZhdWx0cyB0byBgVW5pcXVlbmVzc01vZGU6Ok5vbmVgIHdoZW4gbm90IHNldC4AAAAAAAATZ2V0X3VuaXF1ZW5lc3NfbW9kZQAAAAAAAAAAAQAAB9AAAAAOVW5pcXVlbmVzc01vZGUAAA==',
        'AAAAAAAAAEpDaGVjayB3aGV0aGVyIGZhbGxiYWNrIHRvIE1lcmtsZSByZWdpc3RyYXRpb24gaXMgYWxsb3dlZCBmb3IgWksgY2FtcGFpZ25zLgAAAAAAE2lzX2ZhbGxiYWNrX2FsbG93ZWQAAAAAAAAAAAEAAAAB',
        'AAAAAAAAAStTZXQgdGhlIHVuaXF1ZW5lc3MgbW9kZSBmb3IgdGhpcyBjYW1wYWlnbiAoYWRtaW4gb25seSkuCgpDb250cm9scyB3aGV0aGVyIGFudGktc3liaWwgdW5pcXVlbmVzcyBpcyBlbmZvcmNlZDoKLSBgTm9uZWA6IG5vIHVuaXF1ZW5lc3MgZW5mb3JjZW1lbnQgKGN1cnJlbnQgYmVoYXZpb3IpLgotIGBOdWxsaWZpZXJgOiByZXF1aXJlcyBhIG51bGxpZmllciByZWdpc3RyeSBwcm9vZiBmb3IgdW5pcXVlbmVzcy4KCmByZWdpc3RyeV9hZGRyZXNzYCBtdXN0IGJlIHByb3ZpZGVkIHdoZW4gc2V0dGluZyBgTnVsbGlmaWVyYCBtb2RlLgAAAAATc2V0X3VuaXF1ZW5lc3NfbW9kZQAAAAAEAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABW5vbmNlAAAAAAAABgAAAAAAAAAEbW9kZQAAB9AAAAAOVW5pcXVlbmVzc01vZGUAAAAAAAAAAAAQcmVnaXN0cnlfYWRkcmVzcwAAA+gAAAATAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAADhDYW5jZWwgYW4gaW4tZmxpZ2h0IGFkbWluIHRyYW5zZmVyIChjdXJyZW50IGFkbWluIG9ubHkpLgAAABVjYW5jZWxfYWRtaW5fdHJhbnNmZXIAAAAAAAABAAAAAAAAAA1jdXJyZW50X2FkbWluAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAACxHZXQgdGhlIGNvbmZpZ3VyZWQgYWN0aXZpdHkgbG9nIGJ1ZmZlciBzaXplLgAAABVnZXRfYWN0aXZpdHlfbG9nX3NpemUAAAAAAAAAAAAAAQAAAAQ=',
        'AAAAAAAAAB5HZXQgY3VycmVudCBwYXJ0aWNpcGFudCBjb3VudC4AAAAAABVnZXRfcGFydGljaXBhbnRfY291bnQAAAAAAAAAAAAAAQAAAAY=',
        'AAAAAAAAAI5TZXQgdGhlIG1heGltdW0gc2l6ZSBvZiB0aGUgYWN0aXZpdHkgbG9nIHJpbmcgYnVmZmVyIChhZG1pbiBvbmx5KS4KTXVzdCBiZSBiZXR3ZWVuIE1JTl9BQ1RJVklUWV9MT0dfU0laRSAoMTApIGFuZCBNQVhfQUNUSVZJVFlfTE9HX1NJWkUgKDIwMCkuAAAAAAAVc2V0X2FjdGl2aXR5X2xvZ19zaXplAAAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAVub25jZQAAAAAAAAYAAAAAAAAABHNpemUAAAAEAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAADJHZXQgdGhlIG51bGxpZmllciByZWdpc3RyeSBhZGRyZXNzLCBpZiBjb25maWd1cmVkLgAAAAAAFmdldF9udWxsaWZpZXJfcmVnaXN0cnkAAAAAAAAAAAABAAAD6AAAABM=',
        'AAAAAAAAAIxTZXQgdGhlIE0tb2YtTiBtdWx0aXNpZyB0aHJlc2hvbGQgZm9yIGNyaXRpY2FsIG9wZXJhdGlvbnMgKGFkbWluIG9ubHkpLgpgcmVxdWlyZWQgPSAwYCBkaXNhYmxlcyBtdWx0aXNpZyAobGVnYWN5IHNpbmdsZS1hZG1pbiBhdXRoIGFwcGxpZXMpLgAAABZzZXRfbXVsdGlzaWdfdGhyZXNob2xkAAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABW5vbmNlAAAAAAAABgAAAAAAAAAIcmVxdWlyZWQAAAAEAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAAcZSZWdpc3RlciBhIHBhcnRpY2lwYW50IHdpdGggdW5pcXVlbmVzcyBwcm9vZiAoYW50aS1zeWJpbCkuCgpXaGVuIHRoZSBjYW1wYWlnbidzIHVuaXF1ZW5lc3MgbW9kZSBpcyBgTnVsbGlmaWVyYCwgdGhpcyBmdW5jdGlvbjoKMS4gVmVyaWZpZXMgdGhlIG51bGxpZmllciBoYXMgbm90IGJlZW4gc3BlbnQgdmlhIHRoZSBudWxsaWZpZXIgcmVnaXN0cnkuCjIuIFNwZW5kcyB0aGUgbnVsbGlmaWVyIHRvIHByZXZlbnQgZG91YmxlLXJlZ2lzdHJhdGlvbi4KClRoZSBgdW5pcXVlbmVzc19wcm9vZmAgaXMgcGFzc2VkIHRocm91Z2ggdG8gdGhlIHJlZ2lzdHJ5IGZvcgpmdXR1cmUgdmVyaWZpY2F0aW9uLiBGb3Igbm93LCBpdCdzIHN0b3JlZCBhbG9uZ3NpZGUgdGhlIG51bGxpZmllci4KClJldHVybnMgYHRydWVgIG9uIGZpcnN0IHJlZ2lzdHJhdGlvbiwgYGZhbHNlYCBpZiBhbHJlYWR5IHJlZ2lzdGVyZWQuAAAAAAAYcmVnaXN0ZXJfd2l0aF91bmlxdWVuZXNzAAAAAwAAAAAAAAALcGFydGljaXBhbnQAAAAAEwAAAAAAAAAJbnVsbGlmaWVyAAAAAAAD7gAAACAAAAAAAAAAEHVuaXF1ZW5lc3NfcHJvb2YAAAAOAAAAAQAAA+kAAAABAAAAAw==',
        'AAAAAAAAAfRHYXJiYWdlLWNvbGxlY3QgYFBBUlRJQ0lQQU5UX1JFR0lTVFJZYCBlbnRyaWVzIHdob3NlIHBlcnNpc3RlbnQKcGFydGljaXBhbnQgcmVjb3JkIGlzIGdvbmUg4oCUIGVpdGhlciBleHBsaWNpdGx5IGRlcmVnaXN0ZXJlZCwgb3IKYXJjaGl2ZWQgYnkgdGhlIG5ldHdvcmsgYWZ0ZXIgaXRzIFRUTCBsYXBzZWQgKCMyODApIOKAlCB1cCB0bwpgbWF4X2VudHJpZXNgIHBlciBjYWxsLiBDYWxsYWJsZSBieSBhbnlvbmUgc2luY2UgaXQgb25seSBkZWxldGVzCnN0YWxlIGJvb2trZWVwaW5nLCBuZXZlciBsaXZlIGRhdGEuIFJldHVybnMgdGhlIG51bWJlciBwcnVuZWQuCgpVc2VzIHN3YXAtcmVtb3ZlIHNvIGVhY2ggcHJ1bmVkIGVudHJ5IGlzIE8oMSk7IGEgcGVyc2lzdGVkIGN1cnNvcgpsZXRzIHJlcGVhdGVkIGNhbGxzIHN3ZWVwIHRoZSB3aG9sZSByZWdpc3RyeSBvdmVyIHRpbWUgd2l0aG91dApyZXNjYW5uaW5nIGZyb20gdGhlIHN0YXJ0LCBib3VuZGluZyB3b3JrIHBlciBjYWxsLgAAABpwcnVuZV9leHBpcmVkX3BhcnRpY2lwYW50cwAAAAAAAQAAAAAAAAALbWF4X2VudHJpZXMAAAAABAAAAAEAAAAE',
      ]),
      options,
    );
  }
  public readonly fromJSON = {
    admin: this.txFromJSON<string>,
    migrate: this.txFromJSON<Result<u32>>,
    upgrade: this.txFromJSON<Result<void>>,
    register: this.txFromJSON<Result<boolean>>,
    is_active: this.txFromJSON<boolean>,
    deregister: this.txFromJSON<Result<boolean>>,
    get_window: this.txFromJSON<readonly [u64, u64]>,
    initialize: this.txFromJSON<Result<void>>,
    set_active: this.txFromJSON<Result<void>>,
    set_window: this.txFromJSON<Result<void>>,
    admin_nonce: this.txFromJSON<u64>,
    get_max_cap: this.txFromJSON<u64>,
    invite_used: this.txFromJSON<boolean>,
    referrer_of: this.txFromJSON<Option<string>>,
    set_max_cap: this.txFromJSON<Result<void>>,
    accept_admin: this.txFromJSON<Result<void>>,
    activity_log: this.txFromJSON<Array<ActivityEntry>>,
    add_co_admin: this.txFromJSON<Result<void>>,
    issue_invite: this.txFromJSON<Result<void>>,
    pending_admin: this.txFromJSON<Option<string>>,
    propose_admin: this.txFromJSON<Result<void>>,
    revoke_invite: this.txFromJSON<Result<void>>,
    storage_stats: this.txFromJSON<readonly [u64, u64, u64]>,
    is_invite_only: this.txFromJSON<boolean>,
    is_participant: this.txFromJSON<boolean>,
    referral_count: this.txFromJSON<u64>,
    schema_version: this.txFromJSON<u32>,
    get_merkle_root: this.txFromJSON<Option<Buffer>>,
    register_unique: this.txFromJSON<Result<boolean>>,
    remove_co_admin: this.txFromJSON<Result<void>>,
    set_invite_only: this.txFromJSON<Result<void>>,
    set_merkle_root: this.txFromJSON<Result<void>>,
    admin_deregister: this.txFromJSON<Result<boolean>>,
    get_privacy_mode: this.txFromJSON<PrivacyMode>,
    is_within_window: this.txFromJSON<boolean>,
    register_private: this.txFromJSON<Result<boolean>>,
    set_privacy_mode: this.txFromJSON<Result<void>>,
    prune_used_nonces: this.txFromJSON<u32>,
    multisig_threshold: this.txFromJSON<u32>,
    get_uniqueness_mode: this.txFromJSON<UniquenessMode>,
    is_fallback_allowed: this.txFromJSON<boolean>,
    set_uniqueness_mode: this.txFromJSON<Result<void>>,
    cancel_admin_transfer: this.txFromJSON<Result<void>>,
    get_activity_log_size: this.txFromJSON<u32>,
    get_participant_count: this.txFromJSON<u64>,
    set_activity_log_size: this.txFromJSON<Result<void>>,
    get_nullifier_registry: this.txFromJSON<Option<string>>,
    set_multisig_threshold: this.txFromJSON<Result<void>>,
    register_with_uniqueness: this.txFromJSON<Result<boolean>>,
    prune_expired_participants: this.txFromJSON<u32>,
  };
}

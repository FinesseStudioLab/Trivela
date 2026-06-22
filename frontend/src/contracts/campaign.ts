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
};

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
   * `referrer` – optional address of an already-registered participant who
   * referred this registrant (issue #455). When supplied, the
   * contract records `(referee -> referrer)`, increments the
   * referrer's tally, and emits a `referred` event so the backend
   * indexer can credit the referral bonus trustlessly. A referrer
   * cannot refer themselves (`Error::SelfReferral`) and must
   * already be registered (`Error::ReferrerNotRegistered`).
   * Referral is recorded only on first registration; passing a
   * referrer on a repeat call is a no-op.
   *
   * Returns `true` on first registration, `false` if already registered.
   */
  register: (
    {
      participant,
      leaf,
      proof,
      referrer,
    }: { participant: string; leaf: Buffer; proof: Array<Buffer>; referrer: Option<string> },
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
   * Construct and simulate a set_merkle_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the Merkle root for allowlist-gated registration (admin only).
   *
   * Once set, every `register` call must supply a valid `(leaf, proof)`.
   * Remove the root by calling this again with a root of all zeros to
   * revert to open registration.
   */
  set_merkle_root: (
    { admin, nonce, root }: { admin: string; nonce: u64; root: Buffer },
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
   * Construct and simulate a cancel_admin_transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancel an in-flight admin transfer (current admin only).
   */
  cancel_admin_transfer: (
    { current_admin }: { current_admin: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a get_participant_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get current participant count.
   */
  get_participant_count: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>;
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
        'AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACwAAAAAAAAAMVW5hdXRob3JpemVkAAAAZAAAAAAAAAART3V0c2lkZVRpbWVXaW5kb3cAAAAAAABlAAAAAAAAAApDYXBSZWFjaGVkAAAAAABmAAAAAAAAABBDYW1wYWlnbkluYWN0aXZlAAAAZwAAAAAAAAAOTm90SW5BbGxvd2xpc3QAAAAAAGgAAAAAAAAAFFVuc3VwcG9ydGVkTWlncmF0aW9uAAAAaQAAAAAAAAARSW52YWxpZEFkbWluTm9uY2UAAAAAAABqAAAAAAAAAA1JbnZhbGlkV2luZG93AAAAAAAAawAAAAAAAAAOTm9QZW5kaW5nQWRtaW4AAAAAAGwAAAAAAAAADFNlbGZSZWZlcnJhbAAAAG0AAAAAAAAAFVJlZmVycmVyTm90UmVnaXN0ZXJlZAAAAAAAAG4=',
        'AAAAAAAAACFSZXR1cm4gdGhlIGN1cnJlbnQgYWRtaW4gYWRkcmVzcy4AAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAABM=',
        'AAAAAAAAALZNaWdyYXRpb24gZW50cnlwb2ludCBmb3IgZnV0dXJlIHNjaGVtYSB0cmFuc2l0aW9ucy4KCkZvciBub3csIHZlcnNpb24gYDFgIGlzIHRoZSBvbmx5IHN1cHBvcnRlZCBzY2hlbWEgYW5kIHRoaXMgZnVuY3Rpb24Kc2VydmVzIGFzIGFuIGlkZW1wb3RlbnQgbWlncmF0aW9uIGhvb2sgZm9yIHVwZ3JhZGUgd29ya2Zsb3dzLgAAAAAAB21pZ3JhdGUAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAA50YXJnZXRfdmVyc2lvbgAAAAAABAAAAAEAAAPpAAAABAAAAAM=',
        'AAAAAAAAA65SZWdpc3RlciBhIHBhcnRpY2lwYW50LgoKYGxlYWZgICDigJMgdGhlIDMyLWJ5dGUgbGVhZiB2YWx1ZSBjb21taXR0ZWQgaW4gdGhlIE1lcmtsZSB0cmVlIGZvciB0aGlzCnBhcnRpY2lwYW50LiAgTXVzdCBiZSBgc2hhMjU2KGFkZHJlc3NfeGRyX2J5dGVzKWAgZm9yIHRoZQpjYWxsZXIncyBhZGRyZXNzLCBjb21wdXRlZCBieSBvZmYtY2hhaW4gdG9vbGluZy4KCmBwcm9vZmAg4oCTIG9yZGVyZWQgbGlzdCBvZiBzaWJsaW5nIGhhc2hlcyBmb3IgdGhlIE1lcmtsZSBwYXRoIGZyb20KYGxlYWZgIHRvIHRoZSBzdG9yZWQgcm9vdC4gIFBhc3MgYW4gZW1wdHkgYFZlY2Agd2hlbiBubyByb290CmlzIGNvbmZpZ3VyZWQuCgpgcmVmZXJyZXJgIOKAkyBvcHRpb25hbCBhZGRyZXNzIG9mIGFuIGFscmVhZHktcmVnaXN0ZXJlZCBwYXJ0aWNpcGFudCB3aG8KcmVmZXJyZWQgdGhpcyByZWdpc3RyYW50IChpc3N1ZSAjNDU1KS4gV2hlbiBzdXBwbGllZCwgdGhlCmNvbnRyYWN0IHJlY29yZHMgYChyZWZlcmVlIC0+IHJlZmVycmVyKWAsIGluY3JlbWVudHMgdGhlCnJlZmVycmVyJ3MgdGFsbHksIGFuZCBlbWl0cyBhIGByZWZlcnJlZGAgZXZlbnQgc28gdGhlIGJhY2tlbmQKaW5kZXhlciBjYW4gY3JlZGl0IHRoZSByZWZlcnJhbCBib251cyB0cnVzdGxlc3NseS4gQSByZWZlcnJlcgpjYW5ub3QgcmVmZXIgdGhlbXNlbHZlcyAoYEVycm9yOjpTZWxmUmVmZXJyYWxgKSBhbmQgbXVzdAphbHJlYWR5IGJlIHJlZ2lzdGVyZWQgKGBFcnJvcjo6UmVmZXJyZXJOb3RSZWdpc3RlcmVkYCkuClJlZmVycmFsIGlzIHJlY29yZGVkIG9ubHkgb24gZmlyc3QgcmVnaXN0cmF0aW9uOyBwYXNzaW5nIGEKcmVmZXJyZXIgb24gYSByZXBlYXQgY2FsbCBpcyBhIG5vLW9wLgoKUmV0dXJucyBgdHJ1ZWAgb24gZmlyc3QgcmVnaXN0cmF0aW9uLCBgZmFsc2VgIGlmIGFscmVhZHkgcmVnaXN0ZXJlZC4AAAAAAAhyZWdpc3RlcgAAAAQAAAAAAAAAC3BhcnRpY2lwYW50AAAAABMAAAAAAAAABGxlYWYAAAPuAAAAIAAAAAAAAAAFcHJvb2YAAAAAAAPqAAAD7gAAACAAAAAAAAAACHJlZmVycmVyAAAD6AAAABMAAAABAAAD6QAAAAEAAAAD',
        'AAAAAAAAABxDaGVjayBpZiBjYW1wYWlnbiBpcyBhY3RpdmUuAAAACWlzX2FjdGl2ZQAAAAAAAAAAAAABAAAAAQ==',
        'AAAAAAAAAJ1EZXJlZ2lzdGVyIGEgcGFydGljaXBhbnQuCgpDaGVja3MgbGl2ZW5lc3Mvd2luZG93OiBpZiBlbmRfdGltZSBpcyB1NjQ6Ok1BWCwgY2hlY2tzIGlmIGNhbXBhaWduIGlzIGFjdGl2ZTsKb3RoZXJ3aXNlLCBjaGVja3MgaWYgY3VycmVudCB0aW1lc3RhbXAgPD0gZW5kX3RpbWUuAAAAAAAACmRlcmVnaXN0ZXIAAAAAAAEAAAAAAAAAC3BhcnRpY2lwYW50AAAAABMAAAABAAAD6QAAAAEAAAAD',
        'AAAAAAAAAJxHZXQgdGhlIGNvbmZpZ3VyZWQgYChzdGFydCwgZW5kKWAgcmVnaXN0cmF0aW9uIHdpbmRvdy4KCkRlZmF1bHRzIHRvIGAoMCwgdTY0OjpNQVgpYCB3aGVuIG5vIHdpbmRvdyBoYXMgYmVlbiBzZXQsIHdoaWNoCmNhbGxlcnMgY2FuIGludGVycHJldCBhcyAidW5ib3VuZGVkIi4AAAAKZ2V0X3dpbmRvdwAAAAAAAAAAAAEAAAPtAAAAAgAAAAYAAAAG',
        'AAAAAAAAACtJbml0aWFsaXplIGNhbXBhaWduIGNvbnRyYWN0IHdpdGggYW4gYWRtaW4uAAAAAAppbml0aWFsaXplAAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAACZTZXQgY2FtcGFpZ24gYWN0aXZlIGZsYWcgKGFkbWluIG9ubHkpLgAAAAAACnNldF9hY3RpdmUAAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAFbm9uY2UAAAAAAAAGAAAAAAAAAAZhY3RpdmUAAAAAAAEAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAANlTZXQgcmVnaXN0cmF0aW9uIHRpbWUgd2luZG93IChhZG1pbiBvbmx5KS4KCkJvdGggYm91bmRzIGFyZSBpbmNsdXNpdmU6IGByZWdpc3RlcmAgc3VjY2VlZHMgd2hlbgpgc3RhcnQgPD0gbm93IDw9IGVuZGAuIFVzZSBgMGAgYW5kIGB1NjQ6Ok1BWGAgZm9yIGFuIGVmZmVjdGl2ZWx5Cm9wZW4gd2luZG93LiBSZWplY3RzIGBzdGFydCA+IGVuZGAgd2l0aCBgSW52YWxpZFdpbmRvd2AuAAAAAAAACnNldF93aW5kb3cAAAAAAAQAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAFbm9uY2UAAAAAAAAGAAAAAAAAAAVzdGFydAAAAAAAAAYAAAAAAAAAA2VuZAAAAAAGAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAADtHZXQgdGhlIG5leHQgcmVxdWlyZWQgYWRtaW4gbm9uY2UgZm9yIHNlbnNpdGl2ZSBvcGVyYXRpb25zLgAAAAALYWRtaW5fbm9uY2UAAAAAAAAAAAEAAAAG',
        'AAAAAAAAADBHZXQgbWF4aW11bSBwYXJ0aWNpcGFudCBjYXAgKDAgbWVhbnMgdW5saW1pdGVkKS4AAAALZ2V0X21heF9jYXAAAAAAAAAAAAEAAAAG',
        'AAAAAAAAAHZSZXR1cm4gdGhlIHJlZmVycmVyIHJlY29yZGVkIGZvciBgcGFydGljaXBhbnRgIGF0IHJlZ2lzdHJhdGlvbiwgb3IKYE5vbmVgIGlmIHRoZXkgcmVnaXN0ZXJlZCB3aXRob3V0IG9uZSAoaXNzdWUgIzQ1NSkuAAAAAAALcmVmZXJyZXJfb2YAAAAAAQAAAAAAAAALcGFydGljaXBhbnQAAAAAEwAAAAEAAAPoAAAAEw==',
        'AAAAAAAAAEFTZXQgbWF4aW11bSBwYXJ0aWNpcGFudCBjYXAgKGFkbWluIG9ubHkpLiBTZXQgdG8gMCBmb3IgdW5saW1pdGVkLgAAAAAAAAtzZXRfbWF4X2NhcAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABW5vbmNlAAAAAAAABgAAAAAAAAAHbWF4X2NhcAAAAAAGAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAAJFBY2NlcHQgYWRtaW4gcm9sZS4gQ2FsbGVyIE1VU1QgYmUgdGhlIGFkZHJlc3MgdGhhdCB0aGUgY3VycmVudCBhZG1pbgpwcmV2aW91c2x5IHByb3Bvc2VkIHZpYSBgcHJvcG9zZV9hZG1pbmAuIENsZWFycyB0aGUgcGVuZGluZyBzbG90IG9uCnN1Y2Nlc3MuAAAAAAAADGFjY2VwdF9hZG1pbgAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAAEdSZXR1cm4gdGhlIHBlbmRpbmcgYWRtaW4gYWRkcmVzcyBwcm9wb3NlZCBieSB0aGUgY3VycmVudCBhZG1pbiwgaWYgYW55LgAAAAANcGVuZGluZ19hZG1pbgAAAAAAAAAAAAABAAAD6AAAABM=',
        'AAAAAAAAAHxQcm9wb3NlIGEgbmV3IGFkbWluIChjdXJyZW50IGFkbWluIG9ubHkpLiBUaGUgdHJhbnNmZXIgZG9lcyBub3QgdGFrZQplZmZlY3QgdW50aWwgYGFjY2VwdF9hZG1pbmAgaXMgY2FsbGVkIGJ5IHRoZSBuZXcgYWRtaW4uAAAADXByb3Bvc2VfYWRtaW4AAAAAAAACAAAAAAAAAA1jdXJyZW50X2FkbWluAAAAAAAAEwAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAAGpDaGVjayBpZiBhIHBhcnRpY2lwYW50IGlzIHJlZ2lzdGVyZWQuICgjMjgwKSBSZWFkcyBmcm9tCnBlcnNpc3RlbnQgc3RvcmFnZSB3aGVyZSBwYXJ0aWNpcGFudCByZWNvcmRzIGxpdmUuAAAAAAAOaXNfcGFydGljaXBhbnQAAAAAAAEAAAAAAAAAC3BhcnRpY2lwYW50AAAAABMAAAABAAAAAQ==',
        'AAAAAAAAAJ9SZXR1cm4gaG93IG1hbnkgcGFydGljaXBhbnRzIHJlZ2lzdGVyZWQgd2l0aCBgcmVmZXJyZXJgIGFzIHRoZWlyCm9uLWNoYWluIHJlZmVycmVyIChpc3N1ZSAjNDU1KS4gRGVmYXVsdHMgdG8gYDBgIGZvciBhbiBhZGRyZXNzIHRoYXQKaGFzIG5ldmVyIHJlZmVycmVkIGFueW9uZS4AAAAADnJlZmVycmFsX2NvdW50AAAAAAABAAAAAAAAAAhyZWZlcnJlcgAAABMAAAABAAAABg==',
        'AAAAAAAAADxSZXR1cm5zIHRoZSBhY3RpdmUgc3RvcmFnZSBzY2hlbWEgdmVyc2lvbiBmb3IgdGhpcyBjb250cmFjdC4AAAAOc2NoZW1hX3ZlcnNpb24AAAAAAAAAAAABAAAABA==',
        'AAAAAAAAAEtSZXR1cm4gdGhlIGN1cnJlbnQgTWVya2xlIHJvb3QsIG9yIGBOb25lYCB3aGVuIG9wZW4gcmVnaXN0cmF0aW9uIGlzIGFjdGl2ZS4AAAAAD2dldF9tZXJrbGVfcm9vdAAAAAAAAAAAAQAAA+gAAAPuAAAAIA==',
        'AAAAAAAAAOdTZXQgdGhlIE1lcmtsZSByb290IGZvciBhbGxvd2xpc3QtZ2F0ZWQgcmVnaXN0cmF0aW9uIChhZG1pbiBvbmx5KS4KCk9uY2Ugc2V0LCBldmVyeSBgcmVnaXN0ZXJgIGNhbGwgbXVzdCBzdXBwbHkgYSB2YWxpZCBgKGxlYWYsIHByb29mKWAuClJlbW92ZSB0aGUgcm9vdCBieSBjYWxsaW5nIHRoaXMgYWdhaW4gd2l0aCBhIHJvb3Qgb2YgYWxsIHplcm9zIHRvCnJldmVydCB0byBvcGVuIHJlZ2lzdHJhdGlvbi4AAAAAD3NldF9tZXJrbGVfcm9vdAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABW5vbmNlAAAAAAAABgAAAAAAAAAEcm9vdAAAA+4AAAAgAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAAHtEZXJlZ2lzdGVyIGEgcGFydGljaXBhbnQgYnkgdGhlIGFkbWluLgoKQnlwYXNzZXMgdGltZSB3aW5kb3cgYW5kIGxpdmVuZXNzIGNoZWNrcy4gUmVxdWlyZXMgYWRtaW4gYXV0aCBhbmQgbm9uY2UgdmFsaWRhdGlvbi4AAAAAEGFkbWluX2RlcmVnaXN0ZXIAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABW5vbmNlAAAAAAAABgAAAAAAAAALcGFydGljaXBhbnQAAAAAEwAAAAEAAAPpAAAAAQAAAAM=',
        'AAAAAAAAAQNSZXR1cm5zIGB0cnVlYCB3aGVuIHRoZSBjdXJyZW50IGxlZGdlciB0aW1lc3RhbXAgaXMgd2l0aGluCmBbc3RhcnQsIGVuZF1gIG9mIHRoZSBjb25maWd1cmVkIHdpbmRvdy4KCk9mZi1jaGFpbiBjYWxsZXJzIGFuZCBkZXBlbmRlbnQgY29udHJhY3RzIChlLmcuIHJld2FyZHMgbG9naWMpCmNhbiB1c2UgdGhpcyB2aWV3IHRvIGdhdGUgb3BlcmF0aW9ucyBvbiBjYW1wYWlnbiBsaXZlbmVzcyB3aXRob3V0CmR1cGxpY2F0aW5nIHRoZSB3aW5kb3cgY2hlY2suAAAAABBpc193aXRoaW5fd2luZG93AAAAAAAAAAEAAAAB',
        'AAAAAAAAADhDYW5jZWwgYW4gaW4tZmxpZ2h0IGFkbWluIHRyYW5zZmVyIChjdXJyZW50IGFkbWluIG9ubHkpLgAAABVjYW5jZWxfYWRtaW5fdHJhbnNmZXIAAAAAAAABAAAAAAAAAA1jdXJyZW50X2FkbWluAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAAB5HZXQgY3VycmVudCBwYXJ0aWNpcGFudCBjb3VudC4AAAAAABVnZXRfcGFydGljaXBhbnRfY291bnQAAAAAAAAAAAAAAQAAAAY=',
      ]),
      options,
    );
  }
  public readonly fromJSON = {
    admin: this.txFromJSON<string>,
    migrate: this.txFromJSON<Result<u32>>,
    register: this.txFromJSON<Result<boolean>>,
    is_active: this.txFromJSON<boolean>,
    deregister: this.txFromJSON<Result<boolean>>,
    get_window: this.txFromJSON<readonly [u64, u64]>,
    initialize: this.txFromJSON<Result<void>>,
    set_active: this.txFromJSON<Result<void>>,
    set_window: this.txFromJSON<Result<void>>,
    admin_nonce: this.txFromJSON<u64>,
    get_max_cap: this.txFromJSON<u64>,
    referrer_of: this.txFromJSON<Option<string>>,
    set_max_cap: this.txFromJSON<Result<void>>,
    accept_admin: this.txFromJSON<Result<void>>,
    pending_admin: this.txFromJSON<Option<string>>,
    propose_admin: this.txFromJSON<Result<void>>,
    is_participant: this.txFromJSON<boolean>,
    referral_count: this.txFromJSON<u64>,
    schema_version: this.txFromJSON<u32>,
    get_merkle_root: this.txFromJSON<Option<Buffer>>,
    set_merkle_root: this.txFromJSON<Result<void>>,
    admin_deregister: this.txFromJSON<Result<boolean>>,
    is_within_window: this.txFromJSON<boolean>,
    cancel_admin_transfer: this.txFromJSON<Result<void>>,
    get_participant_count: this.txFromJSON<u64>,
  };
}

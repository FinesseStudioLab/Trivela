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
  1: { message: 'Overflow' },
  2: { message: 'InsufficientBalance' },
  3: { message: 'Unauthorized' },
  4: { message: 'ContractPaused' },
  5: { message: 'CreditLimitExceeded' },
  6: { message: 'UnsupportedMigration' },
  7: { message: 'InvalidMultiplier' },
  8: { message: 'RateLimitExceeded' },
  9: { message: 'VestingNotFound' },
  10: { message: 'NoPendingAdmin' },
  11: { message: 'InsufficientReserve' },
  12: { message: 'InvalidRedemptionRate' },
  13: { message: 'InvalidAdminNonce' },
};

/**
 * Vesting schedule record stored per user per vest_id.
 */
export interface VestingRecord {
  claimed: u64;
  end_ledger: u32;
  start_ledger: u32;
  total: u64;
}

export interface Client {
  /**
   * Construct and simulate a admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the current admin address.
   */
  admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;

  /**
   * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Claim rewards for a user (reduces balance).
   */
  claim: (
    { user, amount }: { user: string; amount: u64 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<u64>>>;

  /**
   * Construct and simulate a credit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Credit points to a user.
   */
  credit: (
    { from, user, amount }: { from: string; user: string; amount: u64 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<u64>>>;

  /**
   * Construct and simulate a redeem transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Redeem points for asset tokens.
   * Burns points_amount from user balance, transfers asset tokens to user.
   */
  redeem: (
    { user, points_amount }: { user: string; points_amount: u64 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current points balance for a user.
   */
  balance: (
    { user }: { user: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<u64>>;

  /**
   * Construct and simulate a migrate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Migration entrypoint for future schema changes.
   *
   * Current behavior is intentionally idempotent for version `1`, so operational
   * scripts can call this safely during deployments/upgrades.
   */
  migrate: (
    { admin, target_version }: { admin: string; target_version: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<u32>>>;

  /**
   * Construct and simulate a metadata transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get contract metadata (name and symbol).
   */
  metadata: (options?: MethodOptions) => Promise<AssembledTransaction<readonly [string, string]>>;

  /**
   * Construct and simulate a snapshot transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Record the current ledger number under `snapshot_id` (admin only).
   * Does NOT copy balances — stores a ledger reference for off-chain indexing.
   * Off-chain indexers can use the ledger number with Horizon `getLedgerEntries`
   * to reconstruct balances at that point in time.
   */
  snapshot: (
    { admin, snapshot_id }: { admin: string; snapshot_id: u64 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a is_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Check if contract is paused.
   */
  is_paused: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;

  /**
   * Construct and simulate a set_tiers transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Configure tiered reward distribution for a campaign (admin only).
   */
  set_tiers: (
    {
      admin,
      campaign_id,
      tiers,
    }: { admin: string; campaign_id: u64; tiers: Array<readonly [u64, u64]> },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initialize the rewards contract (admin).
   */
  initialize: (
    { admin, name, symbol }: { admin: string; name: string; symbol: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a set_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pause the contract (admin only). Blocks credit and claim operations.
   */
  set_paused: (
    { admin, paused }: { admin: string; paused: boolean },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a clear_tiers transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Clear configured tiers for a campaign (admin only).
   */
  clear_tiers: (
    { admin, campaign_id }: { admin: string; campaign_id: u64 },
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
   * Construct and simulate a batch_credit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Credit points to multiple users in one call.
   * Each recipient counts as one call toward the rate limit.
   */
  batch_credit: (
    { from, recipients }: { from: string; recipients: Array<readonly [string, u64]> },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a claim_vested transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Claim up to `amount` from the unlocked portion of a specific vesting schedule.
   * Returns the remaining claimable amount in that vest schedule after this claim.
   */
  claim_vested: (
    { user, vest_id, amount }: { user: string; vest_id: u64; amount: u64 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<u64>>>;

  /**
   * Construct and simulate a fund_reserve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Fund redemption reserve (callable by anyone, typically admin).
   * Transfers asset tokens from caller to contract reserve.
   */
  fund_reserve: (
    { from, amount }: { from: string; amount: u64 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a get_snapshot transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the ledger number recorded for `snapshot_id`, or `None`.
   */
  get_snapshot: (
    { snapshot_id }: { snapshot_id: u64 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Option<u64>>>;

  /**
   * Construct and simulate a total_vested transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the sum of all vesting schedule totals for a user (vested + unvested).
   */
  total_vested: (
    { user }: { user: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<u64>>;

  /**
   * Construct and simulate a credit_vested transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Credit a linearly-vesting amount to a user (authorized caller only).
   * Vesting is linear: `unlocked = total * (now - start_ledger) / (end_ledger - start_ledger)`.
   * Returns the new vest_id for this schedule.
   */
  credit_vested: (
    {
      from,
      user,
      total_amount,
      start_ledger,
      end_ledger,
    }: { from: string; user: string; total_amount: u64; start_ledger: u32; end_ledger: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<u64>>>;

  /**
   * Construct and simulate a pending_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the pending admin address proposed by the current admin, if any.
   * `None` when there is no in-flight transfer.
   */
  pending_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>;

  /**
   * Construct and simulate a propose_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Propose a new admin (current admin only). The transfer does not take
   * effect until `accept_admin` is called by the new admin.
   *
   * Calling again overwrites the previous pending admin, so the current
   * admin can cancel a proposal by calling `cancel_admin_transfer` or by
   * proposing themselves.
   */
  propose_admin: (
    { current_admin, new_admin }: { current_admin: string; new_admin: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a total_claimed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get total claimed rewards (global stats).
   */
  total_claimed: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>;

  /**
   * Construct and simulate a admin_transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Transfer points from one user to another (admin only).
   */
  admin_transfer: (
    { admin, from, to, amount }: { admin: string; from: string; to: string; amount: u64 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a credit_by_rank transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Credit points to a user based on their rank.
   */
  credit_by_rank: (
    { from, user, rank, campaign_id }: { from: string; user: string; rank: u64; campaign_id: u64 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<u64>>>;

  /**
   * Construct and simulate a list_snapshots transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns all `(snapshot_id, ledger_number)` pairs in creation order.
   */
  list_snapshots: (
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Array<readonly [u64, u64]>>>;

  /**
   * Construct and simulate a schema_version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the active storage schema version for this contract.
   */
  schema_version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>;

  /**
   * Construct and simulate a vested_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the currently unlocked but unclaimed vested balance for a user
   * across all active vesting schedules.
   */
  vested_balance: (
    { user }: { user: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<u64>>;

  /**
   * Construct and simulate a redemption_rate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get redemption rate configuration.
   * Returns (asset_address, rate_bps) or None if not configured.
   */
  redemption_rate: (
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Option<readonly [string, u32]>>>;

  /**
   * Construct and simulate a withdraw_reserve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraw asset tokens from redemption reserve (admin only).
   * Used to reclaim unredeemed assets.
   */
  withdraw_reserve: (
    { admin, nonce, amount }: { admin: string; nonce: i128; amount: u64 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a credit_call_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the number of credit calls made by `caller` in the current window.
   */
  credit_call_count: (
    { caller }: { caller: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<u32>>;

  /**
   * Construct and simulate a get_tier_for_rank transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get points reward for a given rank under a campaign.
   */
  get_tier_for_rank: (
    { rank, campaign_id }: { rank: u64; campaign_id: u64 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<u64>>;

  /**
   * Construct and simulate a redemption_reserve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get current redemption reserve balance.
   */
  redemption_reserve: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>;

  /**
   * Construct and simulate a campaign_multiplier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns multiplier in basis points for campaign, defaults to 10_000.
   */
  campaign_multiplier: (
    { campaign_id }: { campaign_id: u64 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<u32>>;

  /**
   * Construct and simulate a credit_for_campaign transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Credit points using campaign multiplier. Rounding uses floor division:
   * `adjusted = base_amount * multiplier_bps / 10_000`.
   */
  credit_for_campaign: (
    {
      from,
      user,
      campaign_id,
      base_amount,
    }: { from: string; user: string; campaign_id: u64; base_amount: u64 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<u64>>>;

  /**
   * Construct and simulate a max_credit_per_call transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get maximum amount allowed per single credit call (0 means unlimited).
   */
  max_credit_per_call: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>;

  /**
   * Construct and simulate a set_redemption_rate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set redemption rate for points-to-asset conversion (admin only).
   * rate_bps: how many units of asset per 10,000 points (basis points).
   * Example: rate_bps = 100 means 100/10,000 = 0.01 asset per point.
   */
  set_redemption_rate: (
    { admin, nonce, asset, rate_bps }: { admin: string; nonce: i128; asset: string; rate_bps: u32 },
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
   * Construct and simulate a get_credit_rate_limit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current rate limit config: `(max_calls, window_ledgers)`.
   * Returns `(0, 0)` when no limit is configured.
   */
  get_credit_rate_limit: (
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<readonly [u32, u32]>>;

  /**
   * Construct and simulate a set_credit_rate_limit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set per-caller credit rate limit (admin only).
   * `max_calls` credits allowed per `window_ledgers` ledger window.
   * Set `max_calls = 0` to disable rate limiting.
   */
  set_credit_rate_limit: (
    { admin, max_calls, window_ledgers }: { admin: string; max_calls: u32; window_ledgers: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a set_campaign_multiplier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set campaign-specific reward multiplier in basis points (admin only).
   * Example: 10_000 = 1.0x, 12_500 = 1.25x, 5_000 = 0.5x.
   */
  set_campaign_multiplier: (
    {
      admin,
      campaign_id,
      multiplier_bps,
    }: { admin: string; campaign_id: u64; multiplier_bps: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a set_max_credit_per_call transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set maximum amount allowed per single credit call (admin only).
   * Set to 0 to disable the limit.
   */
  set_max_credit_per_call: (
    { admin, max_amount }: { admin: string; max_amount: u64 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;
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
        'AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADQAAAAAAAAAIT3ZlcmZsb3cAAAABAAAAAAAAABNJbnN1ZmZpY2llbnRCYWxhbmNlAAAAAAIAAAAAAAAADFVuYXV0aG9yaXplZAAAAAMAAAAAAAAADkNvbnRyYWN0UGF1c2VkAAAAAAAEAAAAAAAAABNDcmVkaXRMaW1pdEV4Y2VlZGVkAAAAAAUAAAAAAAAAFFVuc3VwcG9ydGVkTWlncmF0aW9uAAAABgAAAAAAAAARSW52YWxpZE11bHRpcGxpZXIAAAAAAAAHAAAAAAAAABFSYXRlTGltaXRFeGNlZWRlZAAAAAAAAAgAAAAAAAAAD1Zlc3RpbmdOb3RGb3VuZAAAAAAJAAAAAAAAAA5Ob1BlbmRpbmdBZG1pbgAAAAAACgAAAAAAAAATSW5zdWZmaWNpZW50UmVzZXJ2ZQAAAAALAAAAAAAAABVJbnZhbGlkUmVkZW1wdGlvblJhdGUAAAAAAAAMAAAAAAAAABFJbnZhbGlkQWRtaW5Ob25jZQAAAAAAAA0=',
        'AAAAAQAAADRWZXN0aW5nIHNjaGVkdWxlIHJlY29yZCBzdG9yZWQgcGVyIHVzZXIgcGVyIHZlc3RfaWQuAAAAAAAAAA1WZXN0aW5nUmVjb3JkAAAAAAAABAAAAAAAAAAHY2xhaW1lZAAAAAAGAAAAAAAAAAplbmRfbGVkZ2VyAAAAAAAEAAAAAAAAAAxzdGFydF9sZWRnZXIAAAAEAAAAAAAAAAV0b3RhbAAAAAAAAAY=',
        'AAAAAAAAACFSZXR1cm4gdGhlIGN1cnJlbnQgYWRtaW4gYWRkcmVzcy4AAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAABM=',
        'AAAAAAAAACtDbGFpbSByZXdhcmRzIGZvciBhIHVzZXIgKHJlZHVjZXMgYmFsYW5jZSkuAAAAAAVjbGFpbQAAAAAAAAIAAAAAAAAABHVzZXIAAAATAAAAAAAAAAZhbW91bnQAAAAAAAYAAAABAAAD6QAAAAYAAAAD',
        'AAAAAAAAABhDcmVkaXQgcG9pbnRzIHRvIGEgdXNlci4AAAAGY3JlZGl0AAAAAAADAAAAAAAAAARmcm9tAAAAEwAAAAAAAAAEdXNlcgAAABMAAAAAAAAABmFtb3VudAAAAAAABgAAAAEAAAPpAAAABgAAAAM=',
        'AAAAAAAAAGZSZWRlZW0gcG9pbnRzIGZvciBhc3NldCB0b2tlbnMuCkJ1cm5zIHBvaW50c19hbW91bnQgZnJvbSB1c2VyIGJhbGFuY2UsIHRyYW5zZmVycyBhc3NldCB0b2tlbnMgdG8gdXNlci4AAAAAAAZyZWRlZW0AAAAAAAIAAAAAAAAABHVzZXIAAAATAAAAAAAAAA1wb2ludHNfYW1vdW50AAAAAAAABgAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAACpHZXQgdGhlIGN1cnJlbnQgcG9pbnRzIGJhbGFuY2UgZm9yIGEgdXNlci4AAAAAAAdiYWxhbmNlAAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAAAY=',
        'AAAAAAAAALdNaWdyYXRpb24gZW50cnlwb2ludCBmb3IgZnV0dXJlIHNjaGVtYSBjaGFuZ2VzLgoKQ3VycmVudCBiZWhhdmlvciBpcyBpbnRlbnRpb25hbGx5IGlkZW1wb3RlbnQgZm9yIHZlcnNpb24gYDFgLCBzbyBvcGVyYXRpb25hbApzY3JpcHRzIGNhbiBjYWxsIHRoaXMgc2FmZWx5IGR1cmluZyBkZXBsb3ltZW50cy91cGdyYWRlcy4AAAAAB21pZ3JhdGUAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAA50YXJnZXRfdmVyc2lvbgAAAAAABAAAAAEAAAPpAAAABAAAAAM=',
        'AAAAAAAAAChHZXQgY29udHJhY3QgbWV0YWRhdGEgKG5hbWUgYW5kIHN5bWJvbCkuAAAACG1ldGFkYXRhAAAAAAAAAAEAAAPtAAAAAgAAABEAAAAR',
        'AAAAAAAAAQtSZWNvcmQgdGhlIGN1cnJlbnQgbGVkZ2VyIG51bWJlciB1bmRlciBgc25hcHNob3RfaWRgIChhZG1pbiBvbmx5KS4KRG9lcyBOT1QgY29weSBiYWxhbmNlcyDigJQgc3RvcmVzIGEgbGVkZ2VyIHJlZmVyZW5jZSBmb3Igb2ZmLWNoYWluIGluZGV4aW5nLgpPZmYtY2hhaW4gaW5kZXhlcnMgY2FuIHVzZSB0aGUgbGVkZ2VyIG51bWJlciB3aXRoIEhvcml6b24gYGdldExlZGdlckVudHJpZXNgCnRvIHJlY29uc3RydWN0IGJhbGFuY2VzIGF0IHRoYXQgcG9pbnQgaW4gdGltZS4AAAAACHNuYXBzaG90AAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAtzbmFwc2hvdF9pZAAAAAAGAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAABxDaGVjayBpZiBjb250cmFjdCBpcyBwYXVzZWQuAAAACWlzX3BhdXNlZAAAAAAAAAAAAAABAAAAAQ==',
        'AAAAAAAAAEFDb25maWd1cmUgdGllcmVkIHJld2FyZCBkaXN0cmlidXRpb24gZm9yIGEgY2FtcGFpZ24gKGFkbWluIG9ubHkpLgAAAAAAAAlzZXRfdGllcnMAAAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAAAAAAABXRpZXJzAAAAAAAD6gAAA+0AAAACAAAABgAAAAYAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAAChJbml0aWFsaXplIHRoZSByZXdhcmRzIGNvbnRyYWN0IChhZG1pbikuAAAACmluaXRpYWxpemUAAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAEbmFtZQAAABEAAAAAAAAABnN5bWJvbAAAAAAAEQAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAAERQYXVzZSB0aGUgY29udHJhY3QgKGFkbWluIG9ubHkpLiBCbG9ja3MgY3JlZGl0IGFuZCBjbGFpbSBvcGVyYXRpb25zLgAAAApzZXRfcGF1c2VkAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABnBhdXNlZAAAAAAAAQAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAADNDbGVhciBjb25maWd1cmVkIHRpZXJzIGZvciBhIGNhbXBhaWduIChhZG1pbiBvbmx5KS4AAAAAC2NsZWFyX3RpZXJzAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAAJFBY2NlcHQgYWRtaW4gcm9sZS4gQ2FsbGVyIE1VU1QgYmUgdGhlIGFkZHJlc3MgdGhhdCB0aGUgY3VycmVudCBhZG1pbgpwcmV2aW91c2x5IHByb3Bvc2VkIHZpYSBgcHJvcG9zZV9hZG1pbmAuIENsZWFycyB0aGUgcGVuZGluZyBzbG90IG9uCnN1Y2Nlc3MuAAAAAAAADGFjY2VwdF9hZG1pbgAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAAGVDcmVkaXQgcG9pbnRzIHRvIG11bHRpcGxlIHVzZXJzIGluIG9uZSBjYWxsLgpFYWNoIHJlY2lwaWVudCBjb3VudHMgYXMgb25lIGNhbGwgdG93YXJkIHRoZSByYXRlIGxpbWl0LgAAAAAAAAxiYXRjaF9jcmVkaXQAAAACAAAAAAAAAARmcm9tAAAAEwAAAAAAAAAKcmVjaXBpZW50cwAAAAAD6gAAA+0AAAACAAAAEwAAAAYAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAAJ1DbGFpbSB1cCB0byBgYW1vdW50YCBmcm9tIHRoZSB1bmxvY2tlZCBwb3J0aW9uIG9mIGEgc3BlY2lmaWMgdmVzdGluZyBzY2hlZHVsZS4KUmV0dXJucyB0aGUgcmVtYWluaW5nIGNsYWltYWJsZSBhbW91bnQgaW4gdGhhdCB2ZXN0IHNjaGVkdWxlIGFmdGVyIHRoaXMgY2xhaW0uAAAAAAAADGNsYWltX3Zlc3RlZAAAAAMAAAAAAAAABHVzZXIAAAATAAAAAAAAAAd2ZXN0X2lkAAAAAAYAAAAAAAAABmFtb3VudAAAAAAABgAAAAEAAAPpAAAABgAAAAM=',
        'AAAAAAAAAHZGdW5kIHJlZGVtcHRpb24gcmVzZXJ2ZSAoY2FsbGFibGUgYnkgYW55b25lLCB0eXBpY2FsbHkgYWRtaW4pLgpUcmFuc2ZlcnMgYXNzZXQgdG9rZW5zIGZyb20gY2FsbGVyIHRvIGNvbnRyYWN0IHJlc2VydmUuAAAAAAAMZnVuZF9yZXNlcnZlAAAAAgAAAAAAAAAEZnJvbQAAABMAAAAAAAAABmFtb3VudAAAAAAABgAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAAEBSZXR1cm5zIHRoZSBsZWRnZXIgbnVtYmVyIHJlY29yZGVkIGZvciBgc25hcHNob3RfaWRgLCBvciBgTm9uZWAuAAAADGdldF9zbmFwc2hvdAAAAAEAAAAAAAAAC3NuYXBzaG90X2lkAAAAAAYAAAABAAAD6AAAAAY=',
        'AAAAAAAAAE5SZXR1cm5zIHRoZSBzdW0gb2YgYWxsIHZlc3Rpbmcgc2NoZWR1bGUgdG90YWxzIGZvciBhIHVzZXIgKHZlc3RlZCArIHVudmVzdGVkKS4AAAAAAAx0b3RhbF92ZXN0ZWQAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAG',
        'AAAAAAAAAMtDcmVkaXQgYSBsaW5lYXJseS12ZXN0aW5nIGFtb3VudCB0byBhIHVzZXIgKGF1dGhvcml6ZWQgY2FsbGVyIG9ubHkpLgpWZXN0aW5nIGlzIGxpbmVhcjogYHVubG9ja2VkID0gdG90YWwgKiAobm93IC0gc3RhcnRfbGVkZ2VyKSAvIChlbmRfbGVkZ2VyIC0gc3RhcnRfbGVkZ2VyKWAuClJldHVybnMgdGhlIG5ldyB2ZXN0X2lkIGZvciB0aGlzIHNjaGVkdWxlLgAAAAANY3JlZGl0X3Zlc3RlZAAAAAAAAAUAAAAAAAAABGZyb20AAAATAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAMdG90YWxfYW1vdW50AAAABgAAAAAAAAAMc3RhcnRfbGVkZ2VyAAAABAAAAAAAAAAKZW5kX2xlZGdlcgAAAAAABAAAAAEAAAPpAAAABgAAAAM=',
        'AAAAAAAAAHNSZXR1cm4gdGhlIHBlbmRpbmcgYWRtaW4gYWRkcmVzcyBwcm9wb3NlZCBieSB0aGUgY3VycmVudCBhZG1pbiwgaWYgYW55LgpgTm9uZWAgd2hlbiB0aGVyZSBpcyBubyBpbi1mbGlnaHQgdHJhbnNmZXIuAAAAAA1wZW5kaW5nX2FkbWluAAAAAAAAAAAAAAEAAAPoAAAAEw==',
        'AAAAAAAAARxQcm9wb3NlIGEgbmV3IGFkbWluIChjdXJyZW50IGFkbWluIG9ubHkpLiBUaGUgdHJhbnNmZXIgZG9lcyBub3QgdGFrZQplZmZlY3QgdW50aWwgYGFjY2VwdF9hZG1pbmAgaXMgY2FsbGVkIGJ5IHRoZSBuZXcgYWRtaW4uCgpDYWxsaW5nIGFnYWluIG92ZXJ3cml0ZXMgdGhlIHByZXZpb3VzIHBlbmRpbmcgYWRtaW4sIHNvIHRoZSBjdXJyZW50CmFkbWluIGNhbiBjYW5jZWwgYSBwcm9wb3NhbCBieSBjYWxsaW5nIGBjYW5jZWxfYWRtaW5fdHJhbnNmZXJgIG9yIGJ5CnByb3Bvc2luZyB0aGVtc2VsdmVzLgAAAA1wcm9wb3NlX2FkbWluAAAAAAAAAgAAAAAAAAANY3VycmVudF9hZG1pbgAAAAAAABMAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAAClHZXQgdG90YWwgY2xhaW1lZCByZXdhcmRzIChnbG9iYWwgc3RhdHMpLgAAAAAAAA10b3RhbF9jbGFpbWVkAAAAAAAAAAAAAAEAAAAG',
        'AAAAAAAAADZUcmFuc2ZlciBwb2ludHMgZnJvbSBvbmUgdXNlciB0byBhbm90aGVyIChhZG1pbiBvbmx5KS4AAAAAAA5hZG1pbl90cmFuc2ZlcgAAAAAABAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAARmcm9tAAAAEwAAAAAAAAACdG8AAAAAABMAAAAAAAAABmFtb3VudAAAAAAABgAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAACxDcmVkaXQgcG9pbnRzIHRvIGEgdXNlciBiYXNlZCBvbiB0aGVpciByYW5rLgAAAA5jcmVkaXRfYnlfcmFuawAAAAAABAAAAAAAAAAEZnJvbQAAABMAAAAAAAAABHVzZXIAAAATAAAAAAAAAARyYW5rAAAABgAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAEAAAPpAAAABgAAAAM=',
        'AAAAAAAAAENSZXR1cm5zIGFsbCBgKHNuYXBzaG90X2lkLCBsZWRnZXJfbnVtYmVyKWAgcGFpcnMgaW4gY3JlYXRpb24gb3JkZXIuAAAAAA5saXN0X3NuYXBzaG90cwAAAAAAAAAAAAEAAAPqAAAD7QAAAAIAAAAGAAAABg==',
        'AAAAAAAAADxSZXR1cm5zIHRoZSBhY3RpdmUgc3RvcmFnZSBzY2hlbWEgdmVyc2lvbiBmb3IgdGhpcyBjb250cmFjdC4AAAAOc2NoZW1hX3ZlcnNpb24AAAAAAAAAAAABAAAABA==',
        'AAAAAAAAAGtSZXR1cm5zIHRoZSBjdXJyZW50bHkgdW5sb2NrZWQgYnV0IHVuY2xhaW1lZCB2ZXN0ZWQgYmFsYW5jZSBmb3IgYSB1c2VyCmFjcm9zcyBhbGwgYWN0aXZlIHZlc3Rpbmcgc2NoZWR1bGVzLgAAAAAOdmVzdGVkX2JhbGFuY2UAAAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAAAY=',
        'AAAAAAAAAF9HZXQgcmVkZW1wdGlvbiByYXRlIGNvbmZpZ3VyYXRpb24uClJldHVybnMgKGFzc2V0X2FkZHJlc3MsIHJhdGVfYnBzKSBvciBOb25lIGlmIG5vdCBjb25maWd1cmVkLgAAAAAPcmVkZW1wdGlvbl9yYXRlAAAAAAAAAAABAAAD6AAAA+0AAAACAAAAEwAAAAQ=',
        'AAAAAAAAAF5XaXRoZHJhdyBhc3NldCB0b2tlbnMgZnJvbSByZWRlbXB0aW9uIHJlc2VydmUgKGFkbWluIG9ubHkpLgpVc2VkIHRvIHJlY2xhaW0gdW5yZWRlZW1lZCBhc3NldHMuAAAAAAAQd2l0aGRyYXdfcmVzZXJ2ZQAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAFbm9uY2UAAAAAAAALAAAAAAAAAAZhbW91bnQAAAAAAAYAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAAEZHZXQgdGhlIG51bWJlciBvZiBjcmVkaXQgY2FsbHMgbWFkZSBieSBgY2FsbGVyYCBpbiB0aGUgY3VycmVudCB3aW5kb3cuAAAAAAARY3JlZGl0X2NhbGxfY291bnQAAAAAAAABAAAAAAAAAAZjYWxsZXIAAAAAABMAAAABAAAABA==',
        'AAAAAAAAADRHZXQgcG9pbnRzIHJld2FyZCBmb3IgYSBnaXZlbiByYW5rIHVuZGVyIGEgY2FtcGFpZ24uAAAAEWdldF90aWVyX2Zvcl9yYW5rAAAAAAAAAgAAAAAAAAAEcmFuawAAAAYAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAABAAAABg==',
        'AAAAAAAAACdHZXQgY3VycmVudCByZWRlbXB0aW9uIHJlc2VydmUgYmFsYW5jZS4AAAAAEnJlZGVtcHRpb25fcmVzZXJ2ZQAAAAAAAAAAAAEAAAAG',
        'AAAAAAAAAERSZXR1cm5zIG11bHRpcGxpZXIgaW4gYmFzaXMgcG9pbnRzIGZvciBjYW1wYWlnbiwgZGVmYXVsdHMgdG8gMTBfMDAwLgAAABNjYW1wYWlnbl9tdWx0aXBsaWVyAAAAAAEAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAABAAAABA==',
        'AAAAAAAAAHpDcmVkaXQgcG9pbnRzIHVzaW5nIGNhbXBhaWduIG11bHRpcGxpZXIuIFJvdW5kaW5nIHVzZXMgZmxvb3IgZGl2aXNpb246CmBhZGp1c3RlZCA9IGJhc2VfYW1vdW50ICogbXVsdGlwbGllcl9icHMgLyAxMF8wMDBgLgAAAAAAE2NyZWRpdF9mb3JfY2FtcGFpZ24AAAAABAAAAAAAAAAEZnJvbQAAABMAAAAAAAAABHVzZXIAAAATAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAAAAAAtiYXNlX2Ftb3VudAAAAAAGAAAAAQAAA+kAAAAGAAAAAw==',
        'AAAAAAAAAEZHZXQgbWF4aW11bSBhbW91bnQgYWxsb3dlZCBwZXIgc2luZ2xlIGNyZWRpdCBjYWxsICgwIG1lYW5zIHVubGltaXRlZCkuAAAAAAATbWF4X2NyZWRpdF9wZXJfY2FsbAAAAAAAAAAAAQAAAAY=',
        'AAAAAAAAAMVTZXQgcmVkZW1wdGlvbiByYXRlIGZvciBwb2ludHMtdG8tYXNzZXQgY29udmVyc2lvbiAoYWRtaW4gb25seSkuCnJhdGVfYnBzOiBob3cgbWFueSB1bml0cyBvZiBhc3NldCBwZXIgMTAsMDAwIHBvaW50cyAoYmFzaXMgcG9pbnRzKS4KRXhhbXBsZTogcmF0ZV9icHMgPSAxMDAgbWVhbnMgMTAwLzEwLDAwMCA9IDAuMDEgYXNzZXQgcGVyIHBvaW50LgAAAAAAABNzZXRfcmVkZW1wdGlvbl9yYXRlAAAAAAQAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAFbm9uY2UAAAAAAAALAAAAAAAAAAVhc3NldAAAAAAAABMAAAAAAAAACHJhdGVfYnBzAAAABAAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAADhDYW5jZWwgYW4gaW4tZmxpZ2h0IGFkbWluIHRyYW5zZmVyIChjdXJyZW50IGFkbWluIG9ubHkpLgAAABVjYW5jZWxfYWRtaW5fdHJhbnNmZXIAAAAAAAABAAAAAAAAAA1jdXJyZW50X2FkbWluAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAAG9HZXQgdGhlIGN1cnJlbnQgcmF0ZSBsaW1pdCBjb25maWc6IGAobWF4X2NhbGxzLCB3aW5kb3dfbGVkZ2VycylgLgpSZXR1cm5zIGAoMCwgMClgIHdoZW4gbm8gbGltaXQgaXMgY29uZmlndXJlZC4AAAAAFWdldF9jcmVkaXRfcmF0ZV9saW1pdAAAAAAAAAAAAAABAAAD7QAAAAIAAAAEAAAABA==',
        'AAAAAAAAAJxTZXQgcGVyLWNhbGxlciBjcmVkaXQgcmF0ZSBsaW1pdCAoYWRtaW4gb25seSkuCmBtYXhfY2FsbHNgIGNyZWRpdHMgYWxsb3dlZCBwZXIgYHdpbmRvd19sZWRnZXJzYCBsZWRnZXIgd2luZG93LgpTZXQgYG1heF9jYWxscyA9IDBgIHRvIGRpc2FibGUgcmF0ZSBsaW1pdGluZy4AAAAVc2V0X2NyZWRpdF9yYXRlX2xpbWl0AAAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAltYXhfY2FsbHMAAAAAAAAEAAAAAAAAAA53aW5kb3dfbGVkZ2VycwAAAAAABAAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAAHtTZXQgY2FtcGFpZ24tc3BlY2lmaWMgcmV3YXJkIG11bHRpcGxpZXIgaW4gYmFzaXMgcG9pbnRzIChhZG1pbiBvbmx5KS4KRXhhbXBsZTogMTBfMDAwID0gMS4weCwgMTJfNTAwID0gMS4yNXgsIDVfMDAwID0gMC41eC4AAAAAF3NldF9jYW1wYWlnbl9tdWx0aXBsaWVyAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAAAAAAObXVsdGlwbGllcl9icHMAAAAAAAQAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAAF5TZXQgbWF4aW11bSBhbW91bnQgYWxsb3dlZCBwZXIgc2luZ2xlIGNyZWRpdCBjYWxsIChhZG1pbiBvbmx5KS4KU2V0IHRvIDAgdG8gZGlzYWJsZSB0aGUgbGltaXQuAAAAAAAXc2V0X21heF9jcmVkaXRfcGVyX2NhbGwAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAptYXhfYW1vdW50AAAAAAAGAAAAAQAAA+kAAAACAAAAAw==',
      ]),
      options,
    );
  }
  public readonly fromJSON = {
    admin: this.txFromJSON<string>,
    claim: this.txFromJSON<Result<u64>>,
    credit: this.txFromJSON<Result<u64>>,
    redeem: this.txFromJSON<Result<void>>,
    balance: this.txFromJSON<u64>,
    migrate: this.txFromJSON<Result<u32>>,
    metadata: this.txFromJSON<readonly [string, string]>,
    snapshot: this.txFromJSON<Result<void>>,
    is_paused: this.txFromJSON<boolean>,
    set_tiers: this.txFromJSON<Result<void>>,
    initialize: this.txFromJSON<Result<void>>,
    set_paused: this.txFromJSON<Result<void>>,
    clear_tiers: this.txFromJSON<Result<void>>,
    accept_admin: this.txFromJSON<Result<void>>,
    batch_credit: this.txFromJSON<Result<void>>,
    claim_vested: this.txFromJSON<Result<u64>>,
    fund_reserve: this.txFromJSON<Result<void>>,
    get_snapshot: this.txFromJSON<Option<u64>>,
    total_vested: this.txFromJSON<u64>,
    credit_vested: this.txFromJSON<Result<u64>>,
    pending_admin: this.txFromJSON<Option<string>>,
    propose_admin: this.txFromJSON<Result<void>>,
    total_claimed: this.txFromJSON<u64>,
    admin_transfer: this.txFromJSON<Result<void>>,
    credit_by_rank: this.txFromJSON<Result<u64>>,
    list_snapshots: this.txFromJSON<Array<readonly [u64, u64]>>,
    schema_version: this.txFromJSON<u32>,
    vested_balance: this.txFromJSON<u64>,
    redemption_rate: this.txFromJSON<Option<readonly [string, u32]>>,
    withdraw_reserve: this.txFromJSON<Result<void>>,
    credit_call_count: this.txFromJSON<u32>,
    get_tier_for_rank: this.txFromJSON<u64>,
    redemption_reserve: this.txFromJSON<u64>,
    campaign_multiplier: this.txFromJSON<u32>,
    credit_for_campaign: this.txFromJSON<Result<u64>>,
    max_credit_per_call: this.txFromJSON<u64>,
    set_redemption_rate: this.txFromJSON<Result<void>>,
    cancel_admin_transfer: this.txFromJSON<Result<void>>,
    get_credit_rate_limit: this.txFromJSON<readonly [u32, u32]>,
    set_credit_rate_limit: this.txFromJSON<Result<void>>,
    set_campaign_multiplier: this.txFromJSON<Result<void>>,
    set_max_credit_per_call: this.txFromJSON<Result<void>>,
  };
}

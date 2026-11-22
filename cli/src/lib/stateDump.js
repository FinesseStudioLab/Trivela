/**
 * Contract state dump/restore helpers (issue #1372).
 *
 * Serialise the campaign contract's exported configuration to a JSON file
 * for offline inspection, and read it back for local testnet seeding.
 */

export const STATE_DUMP_VERSION = 1;

/**
 * Build a portable state-dump document from an `export_state` result.
 *
 * @param {string} contractId
 * @param {object} state  Result of `export_state` (CampaignStateDump)
 * @param {{ network?: string, ledger?: number }} meta
 */
export function buildStateDump(contractId, state, meta = {}) {
  if (!contractId) throw new Error('contractId is required');
  if (!state || typeof state !== 'object') throw new Error('state is required');
  return {
    version: STATE_DUMP_VERSION,
    contractId,
    network: meta.network ?? null,
    ledger: meta.ledger ?? null,
    exportedAt: new Date().toISOString(),
    state: {
      admin: state.admin,
      active: Boolean(state.active),
      startTime: String(state.start_time ?? state.startTime ?? 0),
      endTime: String(state.end_time ?? state.endTime ?? 0),
      maxCap: String(state.max_cap ?? state.maxCap ?? 0),
      participantCount: String(state.participant_count ?? state.participantCount ?? 0),
      merkleRoot: state.merkle_root ?? state.merkleRoot ?? null,
      privacyMode: Number(state.privacy_mode ?? state.privacyMode ?? 0),
      inviteOnly: Boolean(state.invite_only ?? state.inviteOnly ?? false),
      feeToken: state.fee_token ?? state.feeToken ?? null,
      feeAmount: String(state.fee_amount ?? state.feeAmount ?? 0),
      feeRecipient: state.fee_recipient ?? state.feeRecipient ?? null,
      schemaVersion: Number(state.schema_version ?? state.schemaVersion ?? 1),
    },
  };
}

/**
 * Validate a dump document and return the on-chain `import_state` payload.
 *
 * @param {object} dump
 * @returns {{ contractId: string, state: object }}
 */
export function parseStateDump(dump) {
  if (!dump || typeof dump !== 'object') throw new Error('dump must be an object');
  if (dump.version !== STATE_DUMP_VERSION) {
    throw new Error(`Unsupported dump version ${dump.version} (expected ${STATE_DUMP_VERSION})`);
  }
  if (!dump.contractId) throw new Error('dump.contractId is required');
  if (!dump.state || typeof dump.state !== 'object') throw new Error('dump.state is required');

  const s = dump.state;
  if (!s.admin) throw new Error('dump.state.admin is required');
  if (s.schemaVersion !== 1) {
    throw new Error(`Unsupported schemaVersion ${s.schemaVersion}`);
  }

  return {
    contractId: dump.contractId,
    state: {
      admin: s.admin,
      active: Boolean(s.active),
      start_time: BigInt(s.startTime ?? 0),
      end_time: BigInt(s.endTime ?? 0),
      max_cap: BigInt(s.maxCap ?? 0),
      participant_count: BigInt(s.participantCount ?? 0),
      merkle_root: s.merkleRoot ?? null,
      privacy_mode: Number(s.privacyMode ?? 0),
      invite_only: Boolean(s.inviteOnly ?? false),
      fee_token: s.feeToken ?? null,
      fee_amount: BigInt(s.feeAmount ?? 0),
      fee_recipient: s.feeRecipient ?? null,
      schema_version: Number(s.schemaVersion),
    },
  };
}

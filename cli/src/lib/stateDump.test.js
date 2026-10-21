import { buildStateDump, parseStateDump, STATE_DUMP_VERSION } from './stateDump.js';

describe('stateDump', () => {
  const rawState = {
    admin: 'GADMIN',
    active: true,
    start_time: 100,
    end_time: 200,
    max_cap: 500,
    participant_count: 3,
    merkle_root: null,
    privacy_mode: 0,
    invite_only: false,
    fee_token: null,
    fee_amount: 0,
    fee_recipient: null,
    schema_version: 1,
  };

  test('buildStateDump produces a portable document', () => {
    const dump = buildStateDump('CCONTRACT', rawState, { network: 'testnet' });
    expect(dump.version).toBe(STATE_DUMP_VERSION);
    expect(dump.contractId).toBe('CCONTRACT');
    expect(dump.network).toBe('testnet');
    expect(dump.state.admin).toBe('GADMIN');
    expect(dump.state.startTime).toBe('100');
    expect(dump.state.endTime).toBe('200');
    expect(dump.state.maxCap).toBe('500');
    expect(dump.state.schemaVersion).toBe(1);
    expect(dump.state.feeToken).toBeNull();
  });

  test('parseStateDump round-trips through buildStateDump', () => {
    const dump = buildStateDump('CCONTRACT', rawState);
    const parsed = parseStateDump(dump);
    expect(parsed.contractId).toBe('CCONTRACT');
    expect(parsed.state.admin).toBe('GADMIN');
    expect(parsed.state.start_time).toBe(100n);
    expect(parsed.state.end_time).toBe(200n);
    expect(parsed.state.max_cap).toBe(500n);
    expect(parsed.state.participant_count).toBe(3n);
    expect(parsed.state.schema_version).toBe(1);
  });

  test('buildStateDump normalises fee fields', () => {
    const dump = buildStateDump('CCONTRACT', {
      ...rawState,
      fee_token: 'CTOKEN',
      fee_amount: 50,
      fee_recipient: 'GPOOL',
    });
    expect(dump.state.feeToken).toBe('CTOKEN');
    expect(dump.state.feeAmount).toBe('50');
    expect(dump.state.feeRecipient).toBe('GPOOL');
    const parsed = parseStateDump(dump);
    expect(parsed.state.fee_amount).toBe(50n);
    expect(parsed.state.fee_token).toBe('CTOKEN');
  });

  test('parseStateDump rejects bad version', () => {
    expect(() => parseStateDump({ version: 99, contractId: 'C', state: rawState })).toThrow(
      /Unsupported dump version/
    );
  });

  test('parseStateDump requires admin and schemaVersion 1', () => {
    const dump = buildStateDump('CCONTRACT', rawState);
    delete dump.state.admin;
    expect(() => parseStateDump(dump)).toThrow(/admin/);

    const dump2 = buildStateDump('CCONTRACT', { ...rawState, schema_version: 2 });
    expect(() => parseStateDump(dump2)).toThrow(/schemaVersion/);
  });

  test('buildStateDump accepts camelCase contract output', () => {
    const dump = buildStateDump('CCONTRACT', {
      admin: 'GADMIN',
      active: true,
      startTime: 1,
      endTime: 2,
      maxCap: 3,
      participantCount: 4,
      merkleRoot: 'AA',
      privacyMode: 1,
      inviteOnly: true,
      feeToken: null,
      feeAmount: 0,
      feeRecipient: null,
      schemaVersion: 1,
    });
    expect(dump.state.startTime).toBe('1');
    expect(dump.state.merkleRoot).toBe('AA');
    expect(dump.state.privacyMode).toBe(1);
    expect(dump.state.inviteOnly).toBe(true);
  });
});

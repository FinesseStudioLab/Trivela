// Unit tests for the transaction-history classifier (#295).
//
// The display layer is intentionally thin around `classifyOperation`,
// so unit-testing that function pins the Horizon → table-row mapping
// without needing a DOM.

import { describe, it, expect } from 'vitest';
import { classifyOperation } from './TransactionHistory';

const CAMPAIGN_ID = 'CAMPAIGNCONTRACTID12345';
const REWARDS_ID = 'REWARDSCONTRACTID12345';

function invoke(contractId, method) {
  return {
    type: 'invoke_host_function',
    parameters: [
      { type: 'contract_id', value: contractId },
      { type: 'sym', value: method },
    ],
  };
}

describe('classifyOperation (#295)', () => {
  it('classifies a campaign register call as Register', () => {
    expect(classifyOperation(invoke(CAMPAIGN_ID, 'register'), REWARDS_ID, CAMPAIGN_ID)).toEqual({
      kind: 'Register',
      method: 'register',
      contractId: CAMPAIGN_ID,
    });
  });

  it('classifies a campaign deregister and admin_deregister as Deregister', () => {
    expect(classifyOperation(invoke(CAMPAIGN_ID, 'deregister'), REWARDS_ID, CAMPAIGN_ID).kind).toBe(
      'Deregister',
    );
    expect(
      classifyOperation(invoke(CAMPAIGN_ID, 'admin_deregister'), REWARDS_ID, CAMPAIGN_ID).kind,
    ).toBe('Deregister');
  });

  it('classifies a rewards credit + claim correctly', () => {
    expect(classifyOperation(invoke(REWARDS_ID, 'credit'), REWARDS_ID, CAMPAIGN_ID).kind).toBe(
      'Credit',
    );
    expect(classifyOperation(invoke(REWARDS_ID, 'claim'), REWARDS_ID, CAMPAIGN_ID).kind).toBe(
      'Claim',
    );
  });

  it('returns null for non-Trivela contract calls', () => {
    expect(
      classifyOperation(invoke('SOMETHIRDPARTY', 'whatever'), REWARDS_ID, CAMPAIGN_ID),
    ).toBeNull();
  });

  it('returns null for non-invoke operations (payment, set_options, etc.)', () => {
    expect(classifyOperation({ type: 'payment' }, REWARDS_ID, CAMPAIGN_ID)).toBeNull();
  });

  it('falls back to "Campaign call" for unknown campaign methods', () => {
    expect(classifyOperation(invoke(CAMPAIGN_ID, 'set_window'), REWARDS_ID, CAMPAIGN_ID).kind).toBe(
      'Campaign call',
    );
  });

  it('falls back to "Rewards call" for unknown rewards methods', () => {
    expect(
      classifyOperation(invoke(REWARDS_ID, 'admin_credit'), REWARDS_ID, CAMPAIGN_ID).kind,
    ).toBe('Rewards call');
  });

  it('handles the alternate Horizon shape with parameters under `function`', () => {
    const op = {
      type: 'invoke_host_function',
      function: {
        parameters: [
          { type: 'contract_id', value: CAMPAIGN_ID },
          { type: 'sym', value: 'register' },
        ],
      },
    };
    expect(classifyOperation(op, REWARDS_ID, CAMPAIGN_ID).kind).toBe('Register');
  });
});

/**
 * Mock contract client for testing and development without deploying to Stellar.
 * Provides deterministic responses for campaign and rewards contract operations.
 */

export function createMockSorobanServer() {
  return {
    getLatestLedger: async () => ({
      sequence: '1000',
    }),
    getAccount: async () => ({
      sequenceNumber: '0',
    }),
    sendTransaction: async (_tx) => ({
      status: 'PENDING',
      hash: 'mock-tx-hash-' + Date.now(),
    }),
    getTransaction: async (_hash) => ({
      status: 'SUCCESS',
      envelope: {},
      resultXdr: '',
    }),
  };
}

export function createMockContract(contractId, { name = 'MockContract' } = {}) {
  return {
    contractId,
    name,
    address: () => contractId,
    methods: {
      getTotalSupply: async () => '1000000',
      getBalance: async () => '0',
      transfer: async () => ({ ok: null }),
    },
  };
}

export const MockCampaignContract = {
  mockId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
  createMock: () =>
    createMockContract('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4', {
      name: 'MockCampaignContract',
    }),
};

export const MockRewardsContract = {
  mockId: 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBSC5',
  createMock: () =>
    createMockContract('CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBSC5', {
      name: 'MockRewardsContract',
    }),
};

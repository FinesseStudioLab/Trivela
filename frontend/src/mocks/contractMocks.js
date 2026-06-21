/**
 * Mock contract client for frontend testing and development.
 * Allows running the UI without real contract IDs or Soroban RPC endpoints.
 */

export function createMockSorobanServer() {
  return {
    getLatestLedger: async () => ({
      sequence: '1000',
    }),
    sendTransaction: async (_tx) => ({
      status: 'PENDING',
      hash: 'mock-tx-' + Date.now(),
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

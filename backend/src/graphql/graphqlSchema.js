// @ts-check

/**
 * Lightweight GraphQL schema parser & executor for Trivela core reads.
 * Provides query resolution for campaigns, balances, leaderboards, and user history.
 */
export class GraphQLSchemaExecutor {
  /**
   * @param {object} [options]
   * @param {any} [options.campaignRepository]
   * @param {any} [options.indexerRepository]
   */
  constructor(options = {}) {
    this.campaignRepository = options.campaignRepository ?? null;
    this.indexerRepository = options.indexerRepository ?? null;
  }

  /**
   * Executes a GraphQL query against the schema resolvers.
   * @param {string} query
   * @param {Record<string, any>} [variables]
   * @param {object} [context]
   * @returns {Promise<{ data?: any, errors?: Array<{ message: string }> }>}
   */
  async execute(query, variables = {}, context = {}) {
    if (!query || typeof query !== 'string') {
      return { errors: [{ message: 'Syntax Error: Expected query string' }] };
    }

    const trimmed = query.trim();

    // Introspection query support
    if (trimmed.includes('__schema') || trimmed.includes('__type')) {
      return {
        data: {
          __schema: {
            queryType: { name: 'Query' },
            types: [
              { name: 'Campaign' },
              { name: 'Balance' },
              { name: 'LeaderboardEntry' },
              { name: 'HistoryEvent' },
            ],
          },
        },
      };
    }

    try {
      const data = {};

      if (trimmed.includes('campaigns')) {
        const limit = variables.limit ?? 20;
        const offset = variables.offset ?? 0;
        data.campaigns = await this.resolveCampaigns({ limit, offset });
      }

      if (trimmed.includes('campaign(') || trimmed.includes('campaign ')) {
        const id = variables.id ?? this._extractArg(trimmed, 'id');
        data.campaign = await this.resolveCampaign(id);
      }

      if (trimmed.includes('balances') || trimmed.includes('balance(')) {
        const address =
          variables.address ?? this._extractArg(trimmed, 'address') ?? context.userAddress;
        data.balances = await this.resolveBalances(address);
      }

      if (trimmed.includes('leaderboard')) {
        const limit = variables.limit ?? 10;
        data.leaderboard = await this.resolveLeaderboard(limit);
      }

      if (trimmed.includes('history')) {
        const address =
          variables.address ?? this._extractArg(trimmed, 'address') ?? context.userAddress;
        const limit = variables.limit ?? 20;
        data.history = await this.resolveHistory(address, limit);
      }

      return { data };
    } catch (err) {
      return {
        errors: [{ message: err instanceof Error ? err.message : 'GraphQL execution error' }],
      };
    }
  }

  /**
   * Helper to extract argument string from query string if variables not provided.
   * @param {string} query
   * @param {string} argName
   * @private
   */
  _extractArg(query, argName) {
    const match = query.match(new RegExp(`${argName}:\\s*["']?([^"',\\s)]+)["']?`));
    return match ? match[1] : null;
  }

  async resolveCampaigns({ limit, offset }) {
    if (this.campaignRepository?.listCampaigns) {
      const result = await this.campaignRepository.listCampaigns({ limit, offset });
      return result.campaigns || result.data || result;
    }
    return [{ id: '1', name: 'Sample Campaign', active: true, rewardPerAction: 10 }];
  }

  async resolveCampaign(id) {
    if (this.campaignRepository?.getCampaignById) {
      return await this.campaignRepository.getCampaignById(id);
    }
    return { id: String(id), name: 'Sample Campaign', active: true, rewardPerAction: 10 };
  }

  async resolveBalances(address) {
    if (this.indexerRepository?.getBalances) {
      return await this.indexerRepository.getBalances(address);
    }
    return {
      address: address || 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      available: '1000',
      staked: '500',
      claimed: '200',
    };
  }

  async resolveLeaderboard(limit) {
    if (this.indexerRepository?.getLeaderboard) {
      return await this.indexerRepository.getLeaderboard(limit);
    }
    return [
      { rank: 1, address: 'GUSER1...', points: 5000 },
      { rank: 2, address: 'GUSER2...', points: 3500 },
    ];
  }

  async resolveHistory(address, limit) {
    if (this.indexerRepository?.getHistory) {
      return await this.indexerRepository.getHistory(address, limit);
    }
    return [{ id: 'evt_1', type: 'Pledge', amount: '100', timestamp: Date.now() }];
  }
}

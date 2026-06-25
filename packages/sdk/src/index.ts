export class Trivela {
  private apiUrl: string;
  private wallet?: unknown;

  constructor(config: { apiUrl: string; network?: string; wallet?: unknown }) {
    this.apiUrl = config.apiUrl;
    this.wallet = config.wallet;
  }

  campaigns = {
    list: async (params?: { cursor?: string }) => {
      const url = new URL(`${this.apiUrl}/api/v1/campaigns`);
      if (params?.cursor) url.searchParams.set('cursor', params.cursor);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Failed to list campaigns: ${res.statusText}`);
      return res.json();
    },

    get: async (id: string) => {
      const res = await fetch(`${this.apiUrl}/api/v1/campaigns/${id}`);
      if (!res.ok) throw new Error(`Campaign not found: ${id}`);
      return res.json();
    },

    stats: async (id: string, range?: '7d' | '30d' | 'all') => {
      const url = new URL(`${this.apiUrl}/api/v1/campaigns/${id}/stats`);
      if (range) url.searchParams.set('range', range);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Failed to get campaign stats: ${res.statusText}`);
      return res.json();
    },
  };

  rewards = {
    balance: async (address: string) => {
      const res = await fetch(`${this.apiUrl}/api/v1/rewards/${address}/balance`);
      if (!res.ok) throw new Error('Failed to fetch balance');
      return res.json();
    },
  };
}

export default Trivela;

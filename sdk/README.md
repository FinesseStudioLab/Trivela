# Trivela SDK

Official JavaScript/TypeScript SDK for the [Trivela](https://trivela.network) campaign rewards platform built on Stellar.

## Packages

| Package | Description |
|---------|-------------|
| [`@trivela/core`](./core) | Lightweight REST client and Soroban RPC node manager |
| [`@trivela/client`](./client) | Auto-generated type-safe API client and contract bindings |
| [`trivela-webhook-verify`](./webhook-verify) | Webhook signature verification |
| [Python SDK](./python) | Python bindings (REST + contract helpers) |

## Quickstart

### Install

```bash
npm install @trivela/core
```

### Initialise the client

```typescript
import { createClient } from '@trivela/core';

const client = createClient({
  baseUrl: 'https://api.trivela.network',
  apiKey: process.env.TRIVELA_API_KEY,   // optional for public endpoints
});
```

### Create a campaign

```typescript
const campaign = await client.post<{ id: string; slug: string }>(
  '/api/v1/campaigns',
  {
    name: 'My First Campaign',
    description: 'Rewarding early adopters on Stellar',
    network: 'TESTNET',
  },
);

console.log('Campaign created:', campaign.id, campaign.slug);
```

### Fetch campaigns

```typescript
const { campaigns } = await client.get<{
  campaigns: Array<{ id: string; name: string; status: string }>;
}>('/api/v1/campaigns');

for (const c of campaigns) {
  console.log(`${c.name} [${c.status}]`);
}
```

## Error handling

All API errors surface as `TrivelaHttpError` with `.status` (HTTP status code)
and `.code` (optional machine-readable error code from the response body):

```typescript
import { createClient, TrivelaHttpError } from '@trivela/core';

try {
  await client.post('/api/v1/campaigns', { name: '' });
} catch (err) {
  if (err instanceof TrivelaHttpError) {
    console.error(`${err.status} ${err.code}: ${err.message}`);
  }
}
```

## TypeScript types

For fully-typed request/response shapes, use `@trivela/client`, which re-exports
all types auto-generated from the OpenAPI schema:

```typescript
import type { Campaign, CampaignCreate } from '@trivela/client';
```

## Further reading

- [API reference](../docs/CONTRACT_REFERENCE.md)
- [Architecture overview](../docs/ARCHITECTURE_OVERVIEW.md)
- [Contributing guide](../CONTRIBUTING.md)

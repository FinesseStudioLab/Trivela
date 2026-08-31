# Trivela Example Apps

Runnable integration examples for common Trivela use cases. Each example targets the local dev stack
(`compose up` from repo root) but works against any Trivela deployment.

| Example                                      | Description                                       |
| -------------------------------------------- | ------------------------------------------------- |
| [loyalty/](loyalty/)                         | Point-based loyalty campaign with XLM claim       |
| [airdrop/](airdrop/)                         | Bulk XLM airdrop from a CSV wallet list           |
| [dao-rewards/](dao-rewards/)                 | Weighted DAO governance reward distribution       |
| [partner-integration/](partner-integration/) | Webhook verification & interaction crediting demo |

## Quick start

```bash
# 1. Start the local stack
docker compose up -d

# 2. Seed testnet accounts (optional — see sandbox docs)
node scripts/sandbox-seed.js

# 3. Run any example
cd examples/loyalty
cp .env.example .env && node index.js
```

## Adding a new example

1. Create `examples/<name>/` with `index.js`, `README.md`, and `.env.example`.
2. Add a row to this table.

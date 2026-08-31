# Trivela Example: Airdrop Campaign

Demonstrates a one-shot XLM airdrop to a list of eligible Stellar wallets.

## What it shows

- Bulk-registering wallets from a CSV
- Triggering a simultaneous airdrop distribution
- Verifying on-chain receipt for each address

## Prerequisites

- Node.js 18+
- A funded Stellar testnet admin account
- Trivela backend running locally (`compose up`)

## Run

```bash
cp .env.example .env
node index.js wallets.csv
```

`wallets.csv` format: one `G...` public key per line.

## Flow

```
1. Read eligible wallets from CSV
2. POST /api/campaigns             → create airdrop campaign
3. POST /api/campaigns/:id/register (bulk) → enroll all wallets
4. POST /api/campaigns/:id/airdrop → distribute to all at once
```

# Trivela Example: Loyalty Program

Demonstrates a point-based loyalty campaign where users earn XLM rewards for repeat interactions.

## What it shows

- Creating a campaign via the Trivela API
- Registering participants programmatically
- Tracking cumulative points per wallet
- Claiming XLM rewards once the threshold is met

## Prerequisites

- Node.js 18+
- A funded Stellar testnet account (use [Stellar Laboratory](https://laboratory.stellar.org) or run
  `node ../sandbox/seed.js`)
- Trivela backend running locally (`compose up` from repo root)

## Run

```bash
cp .env.example .env
# Fill in TRIVELA_API_URL, ADMIN_SECRET_KEY, CAMPAIGN_CONTRACT_ID
node index.js
```

## Flow

```
1. POST /api/campaigns        → create loyalty campaign
2. POST /api/campaigns/:id/register  → enroll participant wallet
3. (simulate interactions)
4. POST /api/campaigns/:id/claim     → participant claims reward
```

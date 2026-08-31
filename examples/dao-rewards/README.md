# Trivela Example: DAO Rewards

Demonstrates distributing XLM governance rewards to DAO voters weighted by participation.

## What it shows

- Creating a DAO reward campaign with weighted distribution
- Registering voters with their vote-weight multiplier
- Distributing proportional XLM rewards after a governance cycle

## Prerequisites

- Node.js 18+
- A funded Stellar testnet admin account
- Trivela backend running locally (`compose up`)

## Run

```bash
cp .env.example .env
node index.js
```

## Flow

```
1. POST /api/campaigns              → create DAO reward pool
2. POST /api/campaigns/:id/register → enroll voters with weights
3. POST /api/campaigns/:id/distribute → pay out proportionally
```

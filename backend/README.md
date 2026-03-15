# Trivela Backend

REST API for the Trivela campaign and rewards platform. Handles campaign metadata, health checks, and (optionally) Soroban RPC configuration for the frontend.

## Setup

```bash
npm install
cp .env.example .env  # then edit .env
npm run dev
```

## Environment

- `PORT` – Server port (default 3001)
- `CORS_ORIGIN` – Allowed origin for CORS
- `STELLAR_NETWORK` – `testnet` or `mainnet`
- `SOROBAN_RPC_URL` – Soroban RPC URL for the frontend

## API

- `GET /health` – Health check
- `GET /api` – API info and endpoints
- `GET /api/campaigns` – List campaigns
- `GET /api/campaigns/:id` – Get one campaign

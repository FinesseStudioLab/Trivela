# Trivela Architecture Overview

This document gives contributors a quick map of the Trivela system, the trust boundaries, and how data moves across contracts, backend, and frontend.

## System Diagram

```mermaid
flowchart LR
    U[User Wallet / Browser] --> F[Frontend React + Vite]
    F -->|REST /api/v1| B[Backend Express API]
    F -->|Soroban RPC calls| R[(Soroban RPC)]
    B -->|Health + config checks| R
    R --> C1[Rewards Contract]
    R --> C2[Campaign Contract]
    B --> D[(Campaign DB / in-memory store)]
```

## Component Responsibilities

- `frontend/`
  - Renders campaigns, wallet UX, and claim/register actions.
  - Handles client-side loading/error states and route-level rendering recovery.
  - Reads API and contract configuration from `VITE_*` env values.

- `backend/`
  - Serves campaign CRUD endpoints under `/api/v1`.
  - Exposes health/config/metrics endpoints for operations and integrations.
  - Applies request logging, optional API-key auth for writes, and rate limiting.

- `contracts/rewards`
  - Tracks user points, credit events, and claims.
  - Enforces contract-level authorization and reward accounting.

- `contracts/campaign`
  - Tracks campaign lifecycle and participant registration.
  - Stores campaign-level constraints enforced on-chain.

## Trust Model

- **User wallet signatures** are the source of truth for user-authorized contract actions.
- **Smart contracts** are authoritative for on-chain balances, claims, and campaign participation.
- **Backend API** is authoritative for off-chain campaign metadata served to the UI.
- **Frontend** is untrusted for business logic enforcement; it should only orchestrate and display state.

## Data Flows

### 1) Campaign browsing
1. Frontend calls `GET /api/v1/campaigns`.
2. Backend reads from campaign store and returns paginated data.
3. Frontend renders cards/details with loading and retry behavior.

### 2) Register in campaign
1. User connects wallet in frontend.
2. Frontend constructs/registers transaction via Soroban RPC.
3. Campaign contract validates rules and persists participant state.

### 3) Claim rewards
1. Frontend reads wallet points from rewards contract.
2. User submits claim action.
3. Rewards contract validates and updates on-chain balances/events.

### 4) Operational observability
1. Health checks: `/health`, `/health/rpc`.
2. Metrics scrape: `/metrics` (request totals, errors, route hit counters, uptime gauge).

# Stellar Network Configuration

Trivela supports two explicit Stellar environments across the backend and frontend:

| Network | `STELLAR_NETWORK` / `VITE_STELLAR_NETWORK` | Passphrase                                       | Soroban RPC                           | Horizon                               |
| ------- | ------------------------------------------ | ------------------------------------------------ | ------------------------------------- | ------------------------------------- |
| Testnet | `testnet`                                  | `Test SDF Network ; September 2015`              | `https://soroban-testnet.stellar.org` | `https://horizon-testnet.stellar.org` |
| Mainnet | `mainnet`                                  | `Public Global Stellar Network ; September 2015` | `https://soroban-mainnet.stellar.org` | `https://horizon.stellar.org`         |

## Backend

- Set `STELLAR_NETWORK` to `testnet` or `mainnet`.
- Override `SOROBAN_RPC_URL`, `HORIZON_URL`, or `STELLAR_NETWORK_PASSPHRASE` only when you
  intentionally need non-default endpoints for that named network.
- `GET /api/v1/config` exposes the resolved network values so the frontend can consume them at
  runtime.

## Frontend

- The frontend can still use `VITE_*` values directly.
- On boot, it requests `/api/v1/config` and prefers the backend-provided network settings when that
  endpoint is available.
- This keeps wallet flows, Horizon reads, and Soroban RPC calls aligned with the backend without
  shipping separate frontend-only production constants.

# Trivela Frontend

React + Vite app that talks to the Trivela API and, when wired, Stellar/Soroban for wallet and contract interactions.

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The dev server proxies `/api`, `/api/v1`, and `/health` to the backend on port `3001`.

## E2E tests

End-to-end tests live in `frontend/e2e/` and are powered by [Playwright](https://playwright.dev).

**Run locally:**

```bash
# From the repo root — build first so vite preview has a dist/ to serve
npm run build --workspace=frontend

# Then run the tests (Playwright starts vite preview automatically)
npm run test --workspace=frontend
```

Or from inside the `frontend/` directory:

```bash
npm run build
npm run test
```

**First-time setup** — install the Chromium browser binary once:

```bash
npx playwright install chromium
```

**Tests cover:**

- Page loads with the correct title and hero heading
- Campaigns section renders either a campaign list or an empty state after loading
- Clicking a campaign card navigates to the detail page (runs only when campaigns are present)

The Playwright config is at `frontend/playwright.config.js`. Tests run in Chromium only to keep CI fast.

## Storybook

Run Storybook from the frontend workspace:

```bash
npm run storybook
```

Build the static Storybook bundle with:

```bash
npm run build-storybook
```

## Environment variables

Use `frontend/.env.example` as a starting point. Create a `.env.local` file in `frontend/` when you need to point the app at non-default services.

The frontend validates env values at startup/build time and will fail with a clear error if they are invalid.

```bash
VITE_API_URL=http://localhost:3001
VITE_STELLAR_NETWORK=testnet
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
VITE_HORIZON_URL=https://horizon-testnet.stellar.org
VITE_REWARDS_CONTRACT_ID=CC...
VITE_CAMPAIGN_CONTRACT_ID=CC...
VITE_STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
```

- `VITE_API_URL`: Base URL used for frontend `fetch` calls. Leave empty to use the local Vite proxy.
- `VITE_STELLAR_NETWORK`: Explicit named preset (`testnet` or `mainnet`).
- `VITE_SOROBAN_RPC_URL`: Optional override for the selected network's Soroban RPC endpoint.
- `VITE_HORIZON_URL`: Optional override for the selected network's Horizon endpoint.
- `VITE_REWARDS_CONTRACT_ID`: Optional rewards contract ID for frontend Soroban calls.
- `VITE_CAMPAIGN_CONTRACT_ID`: Optional campaign contract ID for frontend Soroban calls.
- `VITE_STELLAR_NETWORK_PASSPHRASE`: Optional override for the selected network's passphrase.

## Linting and formatting

The frontend uses ESLint and Prettier.

```bash
npm run lint --workspace=frontend
npm run format:check --workspace=frontend
npm run format --workspace=frontend
```

The repository's frontend CI workflow runs linting and formatting checks when the matching scripts
are present.

## API routing

The frontend targets `/api/v1/*` routes by default. Campaign loading uses the paginated response shape from `GET /api/v1/campaigns?page=1&limit=6`. Legacy `/api/*` routes are still supported by the backend for backward compatibility, but new integrations should use the v1 prefix.

## Config usage

The frontend reads these values from [src/config.js](/Users/CMI-James/od/Trivela/frontend/src/config.js):

- API requests are built with `apiUrl(...)`.
- Soroban RPC access goes through `createSorobanServer()`.
- Rewards and campaign contract IDs are exposed through `getRewardsContract()` and `getCampaignContract()`.
- On startup, the frontend fetches `/api/v1/config` and prefers the backend-resolved network config when that endpoint is available.

## Stellar integration

Use `@stellar/stellar-sdk` for:

- Connecting to Soroban RPC
- Building and signing transactions
- Invoking the rewards and campaign contracts

See [Stellar Developers](https://developers.stellar.org/docs) and the root README for deployment flows.

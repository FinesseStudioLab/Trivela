# Trivela

> **New contributor?** Check out the [📖 FAQ](docs/FAQ.md) for common setup, contract, and
> contribution questions before getting started. 🔤 **[Glossary](docs/GLOSSARY.md)** — definitions
> for Soroban, XDR, TTL, Freighter, Horizon, and all Trivela-specific terms.

**Trivela** is a Stellar Soroban–based **campaign and rewards platform**. It lets campaign operators
create on-chain campaigns, register participants, award points via smart contracts, and let users
claim rewards—all on the Stellar network. The project is built for the
[Stellar Wave on Drips](https://www.drips.network/wave/stellar) and is designed for open-source
contributors.

---

## 🚀 Live on Stellar Testnet

Both contracts are **deployed and live on Stellar Testnet**, built from the latest `main` and
verified end-to-end (initialize → credit/balance, initialize → register/participant-count).

| Contract     | Contract ID (Testnet)                                      | Explorer                                                                                                            |
| ------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Rewards**  | `CB6KYDQ7X2V5B46FU7FKZCRCK5ZEYCHRUHZPVF73RA5M5AAUUBQA6IXZ` | [View ↗](https://stellar.expert/explorer/testnet/contract/CB6KYDQ7X2V5B46FU7FKZCRCK5ZEYCHRUHZPVF73RA5M5AAUUBQA6IXZ) |
| **Campaign** | `CDDVJVHP6PUYWB42VQJ6YC7GEUQR622JEE5MY65ZIKUETGDT33QZPBQH` | [View ↗](https://stellar.expert/explorer/testnet/contract/CDDVJVHP6PUYWB42VQJ6YC7GEUQR622JEE5MY65ZIKUETGDT33QZPBQH) |

- **Network:** Stellar Testnet (`Test SDF Network ; September 2015`)
- **Deployer (public key):** `GA4S5DDI3M3H37IDZIK422IH7WPBECOATLAOYPKOJFLBYTKHU2BB4M6P`
- **Soroban RPC:** `https://soroban-testnet.stellar.org`

Wire these into the frontend via `.env.testnet`:

```bash
VITE_STELLAR_NETWORK=testnet
VITE_REWARDS_CONTRACT_ID=CB6KYDQ7X2V5B46FU7FKZCRCK5ZEYCHRUHZPVF73RA5M5AAUUBQA6IXZ
VITE_CAMPAIGN_CONTRACT_ID=CDDVJVHP6PUYWB42VQJ6YC7GEUQR622JEE5MY65ZIKUETGDT33QZPBQH
```

> Testnet deployments are periodically reset by the network. If a contract ID stops resolving,
> redeploy with `STELLAR_SOURCE=<identity> npm run deploy:testnet` and update the values above.

---

## What Trivela Does?

- **Campaigns** – Create and manage reward campaigns with on-chain configuration (Soroban).
- **Rewards contract** – Tracks user points, credits (by admin/campaign), and claims.
- **Campaign contract** – Stores campaign active flag and participant registration.
- **Backend API** – REST API for campaign metadata, health checks, and integration.
- **Frontend** – React app to list campaigns and (when wired) connect wallets and interact with
  contracts.

Use cases: loyalty points, drip campaigns, bounties, and any flow where you need **on-chain
rewards + off-chain campaign metadata**.

---

## Project-Structure

```
Trivela/
├── contracts/           # Soroban (Rust) smart contracts
│   ├── rewards/         # Points balance, credit, claim
│   └── campaign/        # Campaign active flag, participant list
├── backend/             # Node.js Express API
├── frontend/            # React + Vite + Stellar SDK
├── Cargo.toml           # Rust workspace
├── package.json         # npm workspaces (backend + frontend)
└── README.md
```

---

## Architecture

For a quick system map (diagram, trust boundaries, and end-to-end data flows), see
[`docs/ARCHITECTURE_OVERVIEW.md`](docs/ARCHITECTURE_OVERVIEW.md). For the supported Stellar
testnet/mainnet presets and runtime config flow, see
[`docs/STELLAR_NETWORKS.md`](docs/STELLAR_NETWORKS.md).

---

## Security & rate limiting

All public `/api/*` and `/api/v1/*` routes are protected by a rate limiter that keys per **API key**
when present and falls back to per-IP otherwise. Standard `X-RateLimit-Limit` / `-Remaining` /
`-Reset` headers are emitted on every response; the limiter returns `429 Too Many Requests` +
`Retry-After` once the bucket is exhausted.

Configuration via env (defaults below; see [`backend/.env.example`](./backend/.env.example)):

| Variable                   | Default   | Purpose                                                                               |
| -------------------------- | --------- | ------------------------------------------------------------------------------------- |
| `RATE_LIMIT_WINDOW_MS`     | `60000`   | Window size in milliseconds                                                           |
| `RATE_LIMIT_MAX_REQUESTS`  | `60`      | Max requests per key per window                                                       |
| `REDIS_HOST` / `REDIS_URL` | _(unset)_ | When set, swaps the in-memory bucket store for Redis so multiple API pods share state |

Full implementation details (header schema, 429 payload shape, Redis-store considerations) live in
[`backend/README.md`](./backend/README.md). Middleware source is
`backend/src/middleware/rateLimit.js`; unit tests are in `backend/src/middleware/rateLimit.test.js`.

---

## Prerequisites

- **Rust** (for Soroban): [rustup](https://rustup.rs/)
- **Stellar CLI** (optional but recommended):
  [Install Stellar CLI](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup#install-the-stellar-cli)
- **Node.js** 18+

---

## Git setup (maintainers)

If you cloned or created this repo without git:

```bash
./scripts/setup-git.sh
git add . && git commit -m "chore: initial Trivela scaffold"
git branch -M main && git push -u origin main
```

Use a [Personal Access Token (PAT)](https://github.com/settings/tokens) with `repo` scope when
pushing over HTTPS, or switch to SSH:
`git remote set-url origin git@github.com:FinesseStudioLab/Trivela.git`.

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/FinesseStudioLab/Trivela.git
cd Trivela
npm install
```

### Monorepo task runner (Turborepo)

The repo uses [Turborepo](https://turbo.build/repo) to coordinate builds and tests across the
`backend` and `frontend` workspaces with caching and parallelization. Prefer these root-level
commands over running each workspace by hand:

```bash
npm run build   # build:contracts (cargo/stellar), then turbo run build (frontend)
npm run test    # turbo run test  (backend + frontend in parallel)
npm run lint    # turbo run lint  (all workspaces in parallel)
npm run dev      # turbo run dev   (backend + frontend concurrently)
```

`npm run build` builds the Soroban contracts first (which produces the TypeScript bindings the
frontend depends on) and then runs `turbo run build`. Turbo caches task outputs, so unchanged
workspaces are skipped on subsequent runs.

**Remote cache (optional):** remote caching is enabled in `turbo.json`. To share the cache across CI
and machines, export a Vercel Remote Cache (or self-hosted) token:

```bash
export TURBO_TOKEN=<your-token>
export TURBO_TEAM=<your-team>
```

Without these variables Turbo falls back to the local `.turbo` cache only.

### 2. Build and run contracts (Soroban)

To build the smart contracts, ensure you have the
[Stellar CLI](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup#install-the-stellar-cli)
installed.

```bash
# Build both contracts using Stellar CLI
stellar contract build

# Alternatively, build specific packages with cargo
cargo build --target wasm32-unknown-unknown --release -p trivela-rewards-contract
cargo build --target wasm32-unknown-unknown --release -p trivela-campaign-contract
```

#### Building and deploying contracts

Required environment for deploy commands:

```bash
export STELLAR_NETWORK=testnet
export STELLAR_SOURCE=alice
```

`STELLAR_NETWORK` is your Stellar CLI network alias (for example `testnet` or `mainnet`), and
`STELLAR_SOURCE` is the Stellar CLI identity to sign deploy transactions.

Build commands:

```bash
stellar contract build
```

Deploy commands:

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/trivela_rewards_contract.wasm \
  --source "$STELLAR_SOURCE" \
  --network "$STELLAR_NETWORK"

stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/trivela_campaign_contract.wasm \
  --source "$STELLAR_SOURCE" \
  --network "$STELLAR_NETWORK"
```

#### Deploying to Testnet

1. **Configure an Identity**:

   ```bash
   stellar keys generate alice --network testnet
   ```

2. **Deploy the WASM**:

   ```bash
   # Deploy Rewards Contract
   stellar contract deploy \
     --wasm target/wasm32-unknown-unknown/release/trivela_rewards_contract.wasm \
     --source alice --network testnet

   # Deploy Campaign Contract
   stellar contract deploy \
     --wasm target/wasm32-unknown-unknown/release/trivela_campaign_contract.wasm \
     --source alice --network testnet
   ```

3. **Initialize the Contracts**: After deployment, you will receive a Contract ID. Use it to call
   the `initialize` function:
   ```bash
   stellar contract invoke --id <CONTRACT_ID> --source alice --network testnet -- \
     initialize --admin alice --name "Trivela Rewards" --symbol "TVL"
   ```

#### One-command testnet deploy

You can also build and deploy both contracts with the helper script:

```bash
STELLAR_SOURCE=alice npm run deploy:testnet
```

Optional environment variables:

- `STELLAR_NETWORK`: Stellar CLI network alias to deploy against (defaults to `testnet`)
- `STELLAR_SOURCE`: Stellar CLI identity used for the deploy
- `TRIVELA_ENV_OUT`: output env file for the deployed contract IDs (defaults to `.env.testnet`)

The script writes:

```bash
VITE_REWARDS_CONTRACT_ID=...
VITE_CAMPAIGN_CONTRACT_ID=...
```

### 3. Run backend

```bash
cp backend/.env.example backend/.env
npm run dev:backend
```

API: http://localhost:3001 (health: http://localhost:3001/health, v1: http://localhost:3001/api/v1).

Campaign endpoints are available under the versioned prefix:

```bash
GET    /api/v1/campaigns
GET    /api/v1/campaigns/:id
POST   /api/v1/campaigns
PUT    /api/v1/campaigns/:id
DELETE /api/v1/campaigns/:id
```

Migration note: Legacy `/api/*` campaign routes are still available for backward compatibility, but
new integrations should target `/api/v1/*`.

### 4. Run frontend

```bash
npm run dev:frontend
```

App: http://localhost:5173 (proxies `/api` and `/api/v1` to the backend).

### 5. Run both services with Docker Compose

```bash
docker compose up --build
```

This starts the backend on `http://localhost:3001` and the frontend on `http://localhost:5173`. The
backend container uses `CORS_ALLOWED_ORIGINS=http://localhost:5173` and the frontend container uses
`VITE_API_URL=http://backend:3001` so the two services can talk to each other on the Compose
network.

To add the optional Redis service for local experimentation, include the `redis` profile:

```bash
docker compose --profile redis up --build
```

---

## Testing

```bash
# Backend + Frontend tests via Turborepo (parallel, cached)
npm run test

# Rust contracts (run independently of the Turbo pipeline)
cargo test --workspace
npm run test:contracts

# Backend tests
npm run test:backend

# Frontend E2E tests (Playwright)
# 1. Build the frontend first (required for `npm run preview`)
npm run build:frontend
# 2. Run the tests
npm run test:frontend

# Frontend visual regression tests (Playwright + Storybook)
cd frontend
npm run test:visual                # Run visual tests
npm run test:visual:update         # Update baseline snapshots
npm run test:visual:report         # View detailed HTML report
```

The frontend E2E tests use **Playwright**. They run against a local preview server
(`npm run preview`). Ensure the backend is running if you want the tests to hit real API endpoints,
otherwise they will show the "empty state" as expected in a isolated environment.

### Load Testing

Load tests validate backend performance under synthetic traffic using [k6](https://k6.io/):

```bash
# Install k6: brew install k6 (macOS) or see https://k6.io/docs/get-started/installation/

# Run from repo root (starts backend automatically via npm script)
npm run load-test                                      # default: read-campaigns scenario
LOAD_SCENARIO=burst-registration npm run load-test    # user registration spike
LOAD_SCENARIO=claim-storm API_KEY=sk_dev npm run load-test  # reward claim surge
```

Available scenarios (`load-tests/scenarios/`):

- **read-campaigns** (100 VUs, 30s) - Read-heavy GET requests
- **write-campaigns** (10 VUs, 30s) - POST campaign creation
- **mixed-read-write** (80R+20W VUs, 60s) - Combined traffic
- **burst-registration** (0→200 VUs, 70s) - Registration spike
- **claim-storm** (0→150 VUs, 75s) - Concurrent reward claims

See [`load-tests/README.md`](load-tests/README.md) for thresholds, CI integration, and custom
scenarios.

### Visual Regression Testing

Visual regression tests capture screenshots of Storybook components and detect unintended UI
changes:

```bash
cd frontend

# Run tests (starts Storybook automatically)
npm run test:visual

# Update snapshots after intentional design changes
npm run test:visual:update

# View detailed test report with diffs
npm run test:visual:report
```

Tests run automatically in CI on PRs that touch frontend code. See
[`frontend/tests/visual/README.md`](frontend/tests/visual/README.md) for adding new tests and
troubleshooting.

---

## Tech Stack

| Layer           | Stack                                  |
| --------------- | -------------------------------------- |
| Smart contracts | Rust, Soroban SDK                      |
| Backend         | Node.js, Express                       |
| Frontend        | React, Vite, @stellar/stellar-sdk      |
| Network         | Stellar (testnet/mainnet), Soroban RPC |

---

## Maintainer automation

Sync the shared label taxonomy with GitHub CLI:

```bash
gh auth login
npm run labels:sync -- --repo FinesseStudioLab/Trivela
```

The taxonomy lives in [`scripts/github-labels.json`](scripts/github-labels.json) and the sync script
is idempotent, so re-running it updates colors/descriptions instead of failing.

## Creating the 50 contributor issues (maintainers)

After the repo is pushed, create labels and open all 50 issues in GitHub in one go:

```bash
node scripts/create-github-issues.js
```

This reads `PAT` from `.env.local`, creates issues from `docs/issues-data.json`, and can still be
used for bulk issue creation. For labels, prefer `npm run labels:sync` so maintainers can rely on
`gh auth` instead of PAT-based automation.

## Contributing

We welcome contributions, especially from the Stellar and Drip community. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) and check the
[open issues](https://github.com/FinesseStudioLab/Trivela/issues) for labeled tasks (backend,
frontend, smart-contract, good first issue, etc.).

For information about governance, RFCs, and decision-making processes, see
[GOVERNANCE.md](docs/GOVERNANCE.md).

---

## Resources

- [Stellar Developers](https://developers.stellar.org/docs)
- [Soroban smart contracts](https://developers.stellar.org/docs/build/smart-contracts)
- [Stellar Wave | Drips](https://www.drips.network/wave/stellar)
- [Soroban Examples](https://github.com/stellar/soroban-examples)

---

## License

Apache-2.0. See [LICENSE](LICENSE) for details.

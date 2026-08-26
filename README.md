# Trivela

[![Secrets Scanning](https://github.com/FinesseStudioLab/Trivela/actions/workflows/secrets-scan.yml/badge.svg)](https://github.com/FinesseStudioLab/Trivela/actions/workflows/secrets-scan.yml)

> **New contributor?** Check out the [📖 FAQ](docs/FAQ.md) for common setup, contract, and
> contribution questions before getting started. 🔤 **[Glossary](docs/GLOSSARY.md)** — definitions
> for Soroban, XDR, TTL, Freighter, Horizon, and all Trivela-specific terms.

**Trivela** is a Stellar Soroban–based **campaign and rewards platform**. It lets campaign operators
create on-chain campaigns, register participants, award points via smart contracts, and let users
claim rewards—all on the Stellar network. The project is built for the
[Stellar Wave on Drips](https://www.drips.network/wave/stellar) and is designed for open-source
contributors.

---

## � Table of Contents

- [�🚀 Live Deployment](#live-deployment)
- [📖 Overview](#overview)
- [🏗️ Project Structure](#project-structure)
- [🔧 Architecture](#architecture)
- [🔒 Security & Rate Limiting](#security--rate-limiting)
- [📋 Prerequisites](#prerequisites)
- [⚡ Quick Start](#quick-start)
- [🧪 Testing](#testing)
- [💻 Tech Stack](#tech-stack)
- [🛠️ Maintainer Automation](#maintainer-automation)
- [🤝 Contributing](#contributing)
- [📚 Resources](#resources)
- [📄 License](#license)

---

## 🚀 Live Deployment.

Both contracts are **deployed and live on Stellar Testnet**, built from the latest `main` and
verified end-to-end (initialize → credit/balance, initialize → register/participant-count).

### Contract Addresses

| Contract     | Contract ID (Testnet)                                      | Explorer                                                                                                            |
| ------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Rewards**  | `CB6KYDQ7X2V5B46FU7FKZCRCK5ZEYCHRUHZPVF73RA5M5AAUUBQA6IXZ` | [View ↗](https://stellar.expert/explorer/testnet/contract/CB6KYDQ7X2V5B46FU7FKZCRCK5ZEYCHRUHZPVF73RA5M5AAUUBQA6IXZ) |
| **Campaign** | `CDDVJVHP6PUYWB42VQJ6YC7GEUQR622JEE5MY65ZIKUETGDT33QZPBQH` | [View ↗](https://stellar.expert/explorer/testnet/contract/CDDVJVHP6PUYWB42VQJ6YC7GEUQR622JEE5MY65ZIKUETGDT33QZPBQH) |

### Network Configuration

| Property         | Value                                                      |
| ---------------- | ---------------------------------------------------------- |
| **Network**      | Stellar Testnet (`Test SDF Network ; September 2015`)      |
| **Deployer Key** | `GA4S5DDI3M3H37IDZIK422IH7WPBECOATLAOYPKOJFLBYTKHU2BB4M6P` |
| **Soroban RPC**  | `https://soroban-testnet.stellar.org`                      |

### Frontend Configuration

Wire these into the frontend via `.env.testnet`:

```bash
VITE_STELLAR_NETWORK=testnet
VITE_REWARDS_CONTRACT_ID=CB6KYDQ7X2V5B46FU7FKZCRCK5ZEYCHRUHZPVF73RA5M5AAUUBQA6IXZ
VITE_CAMPAIGN_CONTRACT_ID=CDDVJVHP6PUYWB42VQJ6YC7GEUQR622JEE5MY65ZIKUETGDT33QZPBQH
```

> **Note:** Testnet deployments are periodically reset by the network. If a contract ID stops
> resolving, redeploy with `STELLAR_SOURCE=<identity> npm run deploy:testnet` and update the values
> above.

---

## 📖 Overview

### What Trivela Does

| Component             | Description                                                                |
| --------------------- | -------------------------------------------------------------------------- |
| **Campaigns**         | Create and manage reward campaigns with on-chain configuration (Soroban)   |
| **Rewards Contract**  | Tracks user points, credits (by admin/campaign), and claims                |
| **Campaign Contract** | Stores campaign active flag and participant registration                   |
| **Backend API**       | REST API for campaign metadata, health checks, and integration             |
| **Frontend**          | React app to list campaigns and connect wallets to interact with contracts |
| **Embed widgets**     | Sandboxed iframe and script-tag embeds for partners to show campaigns on third-party sites |

### Use Cases

- **Loyalty points** – Reward user engagement with on-chain points
- **Drip campaigns** – Distribute rewards over time based on participation
- **Bounties** – Issue on-chain rewards for completing tasks
- **Custom flows** – Any scenario requiring **on-chain rewards + off-chain campaign metadata**

---

## 🏗️ Project Structure

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

## 🔧 Architecture

For detailed system architecture documentation:

- **System Map** – Diagram, trust boundaries, and end-to-end data flows:
  [`docs/ARCHITECTURE_OVERVIEW.md`](docs/ARCHITECTURE_OVERVIEW.md)
- **Network Configuration** – Stellar testnet/mainnet presets and runtime config flow:
  [`docs/STELLAR_NETWORKS.md`](docs/STELLAR_NETWORKS.md)
- **Mainnet Readiness** – Go/no-go gate and sign-off checklist for production deploy:
  [`docs/MAINNET_READINESS.md`](docs/MAINNET_READINESS.md)

---

## 🔒 Security & Rate Limiting

All public `/api/*` and `/api/v1/*` routes are protected by a rate limiter that keys per **API key**
when present and falls back to per-IP otherwise.

### Rate Limiting Behavior

| Feature                  | Description                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------- |
| **Rate Limit Headers**   | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on every response |
| **Rate Limit Exhausted** | Returns `429 Too Many Requests` with `Retry-After` header                           |
| **Key Strategy**         | API key when present, otherwise per-IP fallback                                     |

### Configuration

| Variable                   | Default   | Purpose                                                                               |
| -------------------------- | --------- | ------------------------------------------------------------------------------------- |
| `RATE_LIMIT_WINDOW_MS`     | `60000`   | Window size in milliseconds                                                           |
| `RATE_LIMIT_MAX_REQUESTS`  | `60`      | Max requests per key per window                                                       |
| `REDIS_HOST` / `REDIS_URL` | _(unset)_ | When set, swaps the in-memory bucket store for Redis so multiple API pods share state |

> See [`backend/.env.example`](./backend/.env.example) for full configuration options.

### Implementation Details

- **Documentation:** [`backend/README.md`](./backend/README.md)
- **Middleware Source:** `backend/src/middleware/rateLimit.js`
- **Unit Tests:** `backend/src/middleware/rateLimit.test.js`

---

## 📋 Prerequisites

| Tool            | Purpose                                              | Installation                                                                                                                   |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Rust**        | Required for Soroban contract development            | [rustup](https://rustup.rs/)                                                                                                   |
| **Stellar CLI** | Optional but recommended for contract deployment     | [Install Stellar CLI](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup#install-the-stellar-cli) |
| **Node.js**     | Required for backend and frontend development (v18+) | [nodejs.org](https://nodejs.org/)                                                                                              |

---

## ⚡ Quick Start

### Step 1: Clone and Install

```bash
git clone https://github.com/FinesseStudioLab/Trivela.git
cd Trivela
npm install
```

### Step 2: Turborepo Setup

The repo uses [Turborepo](https://turbo.build/repo) to coordinate builds and tests across the
`backend` and `frontend` workspaces with caching and parallelization.

#### Available Commands

| Command         | Description                                                      |
| --------------- | ---------------------------------------------------------------- |
| `npm run build` | Build contracts (cargo/stellar), then turbo run build (frontend) |
| `npm run test`  | Run backend + frontend tests in parallel (cached)                |
| `npm run lint`  | Lint all workspaces in parallel                                  |
| `npm run dev`   | Run backend + frontend concurrently                              |

> **Note:** `npm run build` builds the Soroban contracts first (producing TypeScript bindings the
> frontend depends on) then runs `turbo run build`. Turbo caches task outputs, so unchanged
> workspaces are skipped on subsequent runs.

#### Remote Cache (Optional)

To share the cache across CI and machines, export a Vercel Remote Cache (or self-hosted) token:

```bash
export TURBO_TOKEN=<your-token>
export TURBO_TEAM=<your-team>
```

Without these variables, Turbo falls back to the local `.turbo` cache only.

### Step 3: Build and Deploy Contracts

Ensure you have the
[Stellar CLI](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup#install-the-stellar-cli)
installed.

#### 3.1 Build Contracts

```bash
# Build both contracts using Stellar CLI
stellar contract build

# Alternatively, build specific packages with cargo
cargo build --target wasm32-unknown-unknown --release -p trivela-rewards-contract
cargo build --target wasm32-unknown-unknown --release -p trivela-campaign-contract
```

#### 3.2 Configure Deployment Environment

```bash
export STELLAR_NETWORK=testnet
export STELLAR_SOURCE=alice
```

| Variable          | Description                                              |
| ----------------- | -------------------------------------------------------- |
| `STELLAR_NETWORK` | Stellar CLI network alias (e.g., `testnet` or `mainnet`) |
| `STELLAR_SOURCE`  | Stellar CLI identity to sign deploy transactions         |

#### 3.3 Deploy Contracts

```bash
# Deploy Rewards Contract
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/trivela_rewards_contract.wasm \
  --source "$STELLAR_SOURCE" \
  --network "$STELLAR_NETWORK"

# Deploy Campaign Contract
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/trivela_campaign_contract.wasm \
  --source "$STELLAR_SOURCE" \
  --network "$STELLAR_NETWORK"
```

#### 3.4 Initialize Contracts

After deployment, you will receive a Contract ID. Use it to call the `initialize` function:

```bash
stellar contract invoke --id <CONTRACT_ID> --source alice --network testnet -- \
  initialize --admin alice --name "Trivela Rewards" --symbol "TVL"
```

#### 3.5 One-Command Testnet Deploy

Build and deploy both contracts with the helper script:

```bash
STELLAR_SOURCE=alice npm run deploy:testnet
```

**Optional environment variables:**

| Variable          | Default        | Description                                   |
| ----------------- | -------------- | --------------------------------------------- |
| `STELLAR_NETWORK` | `testnet`      | Stellar CLI network alias to deploy against   |
| `STELLAR_SOURCE`  | _(required)_   | Stellar CLI identity used for the deploy      |
| `TRIVELA_ENV_OUT` | `.env.testnet` | Output env file for the deployed contract IDs |

The script generates:

```bash
VITE_REWARDS_CONTRACT_ID=...
VITE_CAMPAIGN_CONTRACT_ID=...
```

### Step 4: Run Backend

```bash
cp backend/.env.example backend/.env
npm run dev:backend
```

#### Backend Endpoints

| Service    | URL                          |
| ---------- | ---------------------------- |
| **API**    | http://localhost:3001        |
| **Health** | http://localhost:3001/health |
| **API v1** | http://localhost:3001/api/v1 |

#### Campaign API Endpoints

| Method   | Endpoint                | Description         |
| -------- | ----------------------- | ------------------- |
| `GET`    | `/api/v1/campaigns`     | List all campaigns  |
| `GET`    | `/api/v1/campaigns/:id` | Get campaign by ID  |
| `POST`   | `/api/v1/campaigns`     | Create new campaign |
| `PUT`    | `/api/v1/campaigns/:id` | Update campaign     |
| `DELETE` | `/api/v1/campaigns/:id` | Delete campaign     |

> **Migration note:** Legacy `/api/*` campaign routes are still available for backward
> compatibility, but new integrations should target `/api/v1/*`.

### Step 5: Run Frontend

```bash
npm run dev:frontend
```

| Service | URL                   |
| ------- | --------------------- |
| **App** | http://localhost:5173 |

> The frontend proxies `/api` and `/api/v1` requests to the backend.

### Step 6: Run with Docker Compose

```bash
docker compose up --build
```

#### Service Configuration

| Service  | URL                   | Environment Variables                        |
| -------- | --------------------- | -------------------------------------------- |
| Backend  | http://localhost:3001 | `CORS_ALLOWED_ORIGINS=http://localhost:5173` |
| Frontend | http://localhost:5173 | `VITE_API_URL=http://backend:3001`           |

#### Add Redis for Local Experimentation

```bash
docker compose --profile redis up --build
```

---

## 🧪 Testing

### Test Commands

| Command                      | Description                                               |
| ---------------------------- | --------------------------------------------------------- |
| `npm run test`               | Backend + Frontend tests via Turborepo (parallel, cached) |
| `cargo test --workspace`     | Rust contract tests                                       |
| `npm run test:contracts`     | Rust contract tests (npm wrapper)                         |
| `npm run test:backend`       | Backend tests only                                        |
| `npm run build:frontend`     | Build frontend (required for E2E tests)                   |
| `npm run test:frontend`      | Frontend E2E tests (Playwright)                           |
| `npm run test:visual`        | Frontend visual regression tests                          |
| `npm run test:visual:update` | Update baseline snapshots                                 |
| `npm run test:visual:report` | View detailed HTML report                                 |

### Frontend E2E Tests

The frontend E2E tests use **Playwright** and run against a local preview server
(`npm run preview`).

| Requirement  | Description                                                   |
| ------------ | ------------------------------------------------------------- |
| **Backend**  | Ensure backend is running for tests to hit real API endpoints |
| **Isolated** | Without backend, tests show "empty state" as expected         |

### Load Testing

Load tests validate backend performance under synthetic traffic using [k6](https://k6.io/).

#### Installation

```bash
brew install k6  # macOS
# See https://k6.io/docs/get-started/installation/ for other platforms
```

#### Running Load Tests

```bash
# Default scenario: read-campaigns
npm run load-test

# Custom scenarios
LOAD_SCENARIO=burst-registration npm run load-test    # User registration spike
LOAD_SCENARIO=claim-storm API_KEY=sk_dev npm run load-test  # Reward claim surge
```

#### Available Scenarios

| Scenario               | Configuration    | Description              |
| ---------------------- | ---------------- | ------------------------ |
| **read-campaigns**     | 100 VUs, 30s     | Read-heavy GET requests  |
| **write-campaigns**    | 10 VUs, 30s      | POST campaign creation   |
| **mixed-read-write**   | 80R+20W VUs, 60s | Combined traffic         |
| **burst-registration** | 0→200 VUs, 70s   | Registration spike       |
| **claim-storm**        | 0→150 VUs, 75s   | Concurrent reward claims |

> See [`load-tests/README.md`](load-tests/README.md) for thresholds, CI integration, and custom
> scenarios.

### Visual Regression Testing

Visual regression tests capture screenshots of Storybook components and detect unintended UI
changes.

```bash
cd frontend

# Run tests (starts Storybook automatically)
npm run test:visual

# Update snapshots after intentional design changes
npm run test:visual:update

# View detailed test report with diffs
npm run test:visual:report
```

> Tests run automatically in CI on PRs that touch frontend code. See
> [`frontend/tests/visual/README.md`](frontend/tests/visual/README.md) for adding new tests and
> troubleshooting.

---

## 💻 Tech Stack

| Layer               | Technology                             |
| ------------------- | -------------------------------------- |
| **Smart contracts** | Rust, Soroban SDK                      |
| **Backend**         | Node.js, Express                       |
| **Frontend**        | React, Vite, @stellar/stellar-sdk      |
| **Network**         | Stellar (testnet/mainnet), Soroban RPC |

---

## 🛠️ Maintainer Automation

### Git Setup

If you cloned or created this repo without git:

```bash
./scripts/setup-git.sh
git add . && git commit -m "chore: initial Trivela scaffold"
git branch -M main && git push -u origin main
```

> Use a [Personal Access Token (PAT)](https://github.com/settings/tokens) with `repo` scope when
> pushing over HTTPS, or switch to SSH:
> `git remote set-url origin git@github.com:FinesseStudioLab/Trivela.git`.

### Sync GitHub Labels

Sync the shared label taxonomy with GitHub CLI:

```bash
gh auth login
npm run labels:sync -- --repo FinesseStudioLab/Trivela
```

| Detail       | Location                                                               |
| ------------ | ---------------------------------------------------------------------- |
| **Taxonomy** | [`scripts/github-labels.json`](scripts/github-labels.json)             |
| **Behavior** | Idempotent – re-running updates colors/descriptions instead of failing |

### Create Contributor Issues

After the repo is pushed, create labels and open all 50 issues in GitHub in one go:

```bash
node scripts/create-github-issues.js
```

| Detail          | Description                                                              |
| --------------- | ------------------------------------------------------------------------ |
| **PAT Source**  | Reads from `.env.local`                                                  |
| **Issues Data** | Creates issues from `docs/issues-data.json`                              |
| **Preference**  | For labels, prefer `npm run labels:sync` (uses `gh auth` instead of PAT) |

---

## 🤝 Contributing

We welcome contributions, especially from the Stellar and Drip community.

| Resource        | Link                                                                |
| --------------- | ------------------------------------------------------------------- |
| **Guidelines**  | [CONTRIBUTING.md](CONTRIBUTING.md)                                  |
| **Open Issues** | [GitHub Issues](https://github.com/FinesseStudioLab/Trivela/issues) |
| **Governance**  | [GOVERNANCE.md](docs/GOVERNANCE.md)                                 |

> Check the open issues for labeled tasks: backend, frontend, smart-contract, good first issue, etc.

---

## 📚 Resources

| Resource                    | Link                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Stellar Developers**      | [developers.stellar.org/docs](https://developers.stellar.org/docs)                 |
| **Soroban smart contracts** | [Soroban Documentation](https://developers.stellar.org/docs/build/smart-contracts) |
| \*\*Stellar Wave            | Drips\*\*                                                                          | [drips.network/wave/stellar](https://www.drips.network/wave/stellar) |
| **Soroban Examples**        | [github.com/stellar/soroban-examples](https://github.com/stellar/soroban-examples) |

---

## 📄 License

Apache-2.0. See [LICENSE](LICENSE) for details.

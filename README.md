# Trivela

**Trivela** is a Stellar Soroban–based **campaign and rewards platform**. It lets campaign operators create on-chain campaigns, register participants, award points via smart contracts, and let users claim rewards—all on the Stellar network. The project is built for the [Stellar Wave on Drips](https://www.drips.network/wave/stellar) and is designed for open-source contributors.

---

## What Trivela Does

- **Campaigns** – Create and manage reward campaigns with on-chain configuration (Soroban).
- **Rewards contract** – Tracks user points, credits (by admin/campaign), and claims.
- **Campaign contract** – Stores campaign active flag and participant registration.
- **Backend API** – REST API for campaign metadata, health checks, and integration.
- **Frontend** – React app to list campaigns and (when wired) connect wallets and interact with contracts.

Use cases: loyalty points, drip campaigns, bounties, and any flow where you need **on-chain rewards + off-chain campaign metadata**.

---

## Project Structure.

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

## Prerequisites

- **Rust** (for Soroban): [rustup](https://rustup.rs/)
- **Stellar CLI** (optional but recommended): [Install Stellar CLI](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup#install-the-stellar-cli)
- **Node.js** 18+

---

## Git setup (maintainers)

If you cloned or created this repo without git:

```bash
./scripts/setup-git.sh
git add . && git commit -m "chore: initial Trivela scaffold"
git branch -M main && git push -u origin main
```

Use a [Personal Access Token (PAT)](https://github.com/settings/tokens) with `repo` scope when pushing over HTTPS, or switch to SSH: `git remote set-url origin git@github.com:FinesseStudioLab/Trivela.git`.

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/FinesseStudioLab/Trivela.git
cd Trivela
npm install
```

### 2. Build and run contracts (Soroban)

To build the smart contracts, ensure you have the [Stellar CLI](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup#install-the-stellar-cli) installed.

```bash
# Build both contracts using Stellar CLI
stellar contract build

# Alternatively, build specific packages with cargo
cargo build --target wasm32-unknown-unknown --release -p trivela-rewards-contract
cargo build --target wasm32-unknown-unknown --release -p trivela-campaign-contract
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

3. **Initialize the Contracts**:
   After deployment, you will receive a Contract ID. Use it to call the `initialize` function:
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

#### Run backend with Docker

```bash
# from repository root
docker build -f backend/Dockerfile -t trivela-backend .

docker run --rm -p 3001:3001 \
  -e PORT=3001 \
  -e STELLAR_NETWORK=testnet \
  -e SOROBAN_RPC_URL=https://soroban-testnet.stellar.org \
  -e CORS_ALLOWED_ORIGINS=http://localhost:5173 \
  -e TRIVELA_API_KEY=dev-secret \
  trivela-backend
```

or using an env file:

```bash
docker run --rm -p 3001:3001 --env-file backend/.env trivela-backend
```

### 4. Run frontend

```bash
npm run dev:frontend
```

App: http://localhost:5173 (proxies `/api` and `/api/v1` to the backend).

---

## Testing

```bash
# Rust contracts
cargo test --workspace

# Backend (when tests exist)
npm run test:backend
```

---

## Tech Stack

| Layer           | Stack |
|----------------|--------|
| Smart contracts| Rust, Soroban SDK |
| Backend        | Node.js, Express |
| Frontend       | React, Vite, @stellar/stellar-sdk |
| Network        | Stellar (testnet/mainnet), Soroban RPC |

---

## Creating the 50 contributor issues (maintainers)

After the repo is pushed, create labels and open all 50 issues in GitHub in one go:

```bash
node scripts/create-github-issues.js
```

This reads `PAT` from `.env.local`, creates the repo labels, then creates each issue from `docs/issues-data.json`. Requires Node 18+ and a PAT with `repo` scope.

## Contributing

We welcome contributions, especially from the Stellar and Drip community. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and check the [open issues](https://github.com/FinesseStudioLab/Trivela/issues) for labeled tasks (backend, frontend, smart-contract, good first issue, etc.).

---

## Resources

- [Stellar Developers](https://developers.stellar.org/docs)
- [Soroban smart contracts](https://developers.stellar.org/docs/build/smart-contracts)
- [Stellar Wave | Drips](https://www.drips.network/wave/stellar)
- [Soroban Examples](https://github.com/stellar/soroban-examples)

---

## License

Apache-2.0. See [LICENSE](LICENSE) for details.

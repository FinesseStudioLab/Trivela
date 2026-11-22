# Testnet Integration Testing

This document describes the testnet integration test workflow and how to use it.

## Overview

The **Testnet Integration Tests** workflow is a GitHub Actions job that:

- Runs on manual trigger (workflow dispatch)
- Optionally deploys contracts to Stellar testnet
- Builds backend and frontend
- Runs full test suite against testnet environment
- Uploads test artifacts on failure

## Prerequisites

To use the testnet workflow, you need:

1. **Soroban Account Secret** - A Stellar account with testnet funds:
   - Create account at: https://laboratory.stellar.org/
   - Fund with testnet lumens from: https://friendbot.stellar.org/
   - Store account secret in GitHub repository secrets as `SOROBAN_TESTNET_ACCOUNT_SECRET`

2. **Deployment Script** - `scripts/deploy-testnet.sh` must exist and:
   - Read contract sources from `contracts/`
   - Deploy using Soroban CLI
   - Output contract IDs for verification

## Running the Workflow

### Via GitHub UI

1. Go to repository > Actions > Testnet Integration Tests
2. Click "Run workflow"
3. Choose options:
   - `deploy_contracts`: Deploy contracts before testing (default: false)
   - `run_smoke_tests`: Run frontend smoke tests (default: true)
4. Click "Run workflow"

### Manual Workflow Trigger

To trigger via CLI:

```bash
gh workflow run testnet-integration.yml \
  -f deploy_contracts=true \
  -f run_smoke_tests=true
```

## Workflow Steps

### 1. Setup

- Checks out code
- Sets up Node.js (v20) with npm cache
- Sets up Rust for contract compilation (if deploying)
- Installs dependencies

### 2. Build

- Validates environment configuration
- Builds contracts (if deploying)
- Builds backend and frontend

### 3. Deploy (Optional)

- Runs `scripts/deploy-testnet.sh`
- Requires `SOROBAN_TESTNET_ACCOUNT_SECRET` in GitHub secrets
- Outputs contract IDs for manual verification

### 4. Test

- Runs backend test suite
- Installs Playwright browsers
- Runs frontend smoke tests (Playwright)

### 5. Artifacts

- Uploads Playwright test report on failure
- Includes test results and browser traces

## Environment Variables

The workflow sets:

```
STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
HORIZON_URL=https://horizon-testnet.stellar.org
```

Frontend tests inherit:

```
VITE_API_URL=http://localhost:3001
VITE_STELLAR_NETWORK=testnet
```

## Secrets Management

- `SOROBAN_TESTNET_ACCOUNT_SECRET` is required for contract deployment
- Secret is injected only during deployment step
- Never logged or exposed in output
- Rotate regularly for security

## Troubleshooting

### 1. Faucet Dry - "Insufficient Lumens" Error

**Symptom:** Deployment or transaction fails with `InsufficientBalance` or "insufficient lumens" error.

**Diagnosis:**
```bash
# Check your account balance using Stellar Laboratory
curl "https://horizon-testnet.stellar.org/accounts/YOUR_PUBLIC_KEY"
# Or check via Soroban CLI
soroban config keys address show YOUR_PUBLIC_KEY --network testnet
```

**Resolution:**
1. Request testnet lumens from the faucet: https://friendbot.stellar.org/
2. If faucet is dry, wait and retry periodically
3. For urgent testing, use the Stellar Laboratory faucet with multiple accounts

---

### 2. RPC Timeout - "Request Timeout" Error

**Symptom:** Calls to `soroban-testnet.stellar.org` fail with timeout or connection errors.

**Diagnosis:**
```bash
# Check RPC endpoint status
curl -s https://soroban-testnet.stellar.org | jq -r '.infinite_timeout'
curl -s https://soroban-testnet.stellar.org/status

# Test RPC connectivity
curl -s -X POST https://soroban-testnet.stellar.org \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
```

**Resolution:**
1. Check the [Stellar Network Status](https://status.stellar.org/) for known outages
2. Increase timeout values in your workflow or CLI commands
3. Retry the operation — testnet can be slow during peak times
4. As a fallback, consider using a private testnet RPC if available

---

### 3. Contract Not Found - "ContractError(0)" or Missing WASM

**Symptom:** Contract invocation fails with `ContractError(0)`, `JsonRpcError(-32602)`, or WASM not found.

**Diagnosis:**
```bash
# Verify contract exists on network
soroban config network add testnet --rpc-url https://soroban-testnet.stellar.org --network-passphrase "Test SDF Network ; September 2015"
soroban contract inspect YOUR_CONTRACT_ID --network testnet

# Check if contract WASM is uploaded
soroban ledger entry read --id YOUR_CONTRACT_ID --network testnet --raw

# List deployed contracts for your account
soroban contract events --network testnet --start 0 --limit 10 2>/dev/null | grep YOUR_CONTRACT_ID
```

**Resolution:**
1. Confirm contract was successfully deployed — check deployment script output for contract IDs
2. Verify you're using the correct network (`testnet` not `mainnet`)
3. Re-deploy the contract if needed: `scripts/deploy-testnet.sh`
4. Ensure the contract ID matches what's configured in your frontend/backend

---

### 4. Secret Not Found - "Secret not found in storage"

**Symptom:** GitHub Actions workflow fails with `Secret not found` error.

**Diagnosis:**
```bash
# Verify secret exists in repository (requires appropriate permissions)
gh secret list | grep SOROBAN_TESTNET
```

**Resolution:**
1. Go to repository **Settings > Secrets and variables > Actions**
2. Create or verify the secret:
   - **Name:** `SOROBAN_TESTNET_ACCOUNT_SECRET`
   - **Value:** Your Soroban testnet account secret key (starts with `S...`)
3. Ensure the account has testnet lumens
4. Re-run the workflow after secret is configured

---

### 5. Build/Compilation Errors

**Symptom:** Tests fail during build phase with Rust or Node.js errors.

**Diagnosis:**
```bash
# Verify Rust toolchain
rustc --version && cargo --version

# Verify Node.js version (should match .nvmrc)
node --version

# Check contract compilation
cd contracts && cargo build --target wasm32-unknown-unknown --release

# Check frontend build
cd frontend && npm run build

# Verify backend builds
cd backend && cargo build --release
```

**Resolution:**
1. Install correct toolchain versions:
   - Rust: `rustup install $(cat rust-toolchain.toml | grep channel | cut -d'"' -f2)`
   - Node.js: `nvm install` (reads from `.nvmrc`)
2. Clear caches: `rm -rf node_modules && npm install`
3. Check for missing system dependencies (e.g., `pkg-config`, `libssl-dev`)
4. Review build logs for specific compilation errors

---

## Community Support

If these troubleshooting steps don't resolve your issue:

- **GitHub Issues:** Report bugs at https://github.com/wandooadzer-cmyk/Trivela/issues
- **Discussions:** Ask questions at https://github.com/wandooadzer-cmyk/Trivela/discussions
- **Stellar Dev Discord:** Get help from the Stellar community at https://discord.gg/stellar

## Best Practices

1. **Schedule regular runs** - Use a cron trigger to regularly test on testnet
2. **Version contracts** - Tag contract builds with version in deployment script
3. **Monitor failures** - Set up notifications for workflow failures
4. **Clean up artifacts** - Old test artifacts consume storage
5. **Security** - Rotate account keys periodically, use separate testnet-only account

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

### Workflow fails with "Secret not found"

Ensure `SOROBAN_TESTNET_ACCOUNT_SECRET` is set in repository settings:

1. Go to Settings > Secrets and variables > Actions
2. Create new repository secret
3. Name: `SOROBAN_TESTNET_ACCOUNT_SECRET`
4. Value: Your Soroban testnet account secret key

### Deployment fails

Check that:

1. Account has enough testnet lumens
2. `scripts/deploy-testnet.sh` exists and is executable
3. Contracts compile successfully
4. RPC endpoint is reachable

### Tests timeout

Testnet operations may be slow. Increase timeout in workflow if needed:

- Change `timeout-minutes: 30` to higher value
- Check testnet RPC status: https://soroban-testnet.stellar.org/status

## Best Practices

1. **Schedule regular runs** - Use a cron trigger to regularly test on testnet
2. **Version contracts** - Tag contract builds with version in deployment script
3. **Monitor failures** - Set up notifications for workflow failures
4. **Clean up artifacts** - Old test artifacts consume storage
5. **Security** - Rotate account keys periodically, use separate testnet-only account

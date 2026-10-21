# Documentation Index

Central map of the Trivela documentation set. Use this file to find the right guide quickly.

## Getting started

| Document                                                         | What it covers                                        |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| [README.md](./README.md)                                         | Project overview, live testnet contracts, quick start |
| [docs/FAQ.md](./docs/FAQ.md)                                     | Common setup, contract, and contribution questions    |
| [docs/GLOSSARY.md](./docs/GLOSSARY.md)                           | Soroban, XDR, TTL, Freighter, Horizon, Trivela terms  |
| [CONTRIBUTING.md](./CONTRIBUTING.md)                             | Contribution workflow and code standards              |
| [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)                     | Local development, mock contracts, env configuration  |
| [docs/DOCKER_DEV_HOT_RELOAD.md](./docs/DOCKER_DEV_HOT_RELOAD.md) | Docker Compose dev auto-reload / file watcher         |

## Architecture & design

| Document                                                         | What it covers                             |
| ---------------------------------------------------------------- | ------------------------------------------ |
| [docs/ARCHITECTURE_OVERVIEW.md](./docs/ARCHITECTURE_OVERVIEW.md) | System diagram, trust model, data flows    |
| [docs/FLOWS.md](./docs/FLOWS.md)                                 | End-to-end user and operator flows         |
| [docs/adr/](./docs/adr/)                                         | Architecture decision records              |
| [docs/rfcs/](./docs/rfcs/)                                       | RFC templates and accepted proposals       |
| [docs/upgradeability.md](./docs/upgradeability.md)               | Contract upgrade path and safety rails     |
| [docs/TTL_STRATEGY.md](./docs/TTL_STRATEGY.md)                   | Storage TTL / `extend_ttl` rent management |

## Smart contracts

| Document                                                     | What it covers                                         |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| [docs/CONTRACTS_API.md](./docs/CONTRACTS_API.md)             | Contract API reference, ABI, TypeScript bindings       |
| [docs/SOROBAN_CHEAT_SHEET.md](./docs/SOROBAN_CHEAT_SHEET.md) | Host functions, arguments, and storage key cheat sheet |
| [docs/MERKLE_ALLOWLIST.md](./docs/MERKLE_ALLOWLIST.md)       | Merkle allowlist registration flow                     |
| [docs/TTL_STRATEGY.md](./docs/TTL_STRATEGY.md)               | Instance/persistent TTL strategy                       |
| [docs/STELLAR_NETWORKS.md](./docs/STELLAR_NETWORKS.md)       | Testnet/mainnet presets and runtime config             |
| [contracts/FUZZING.md](./contracts/FUZZING.md)               | Contract fuzz testing                                  |

## Backend, API & integrations

| Document                                               | What it covers                         |
| ------------------------------------------------------ | -------------------------------------- |
| [backend/README.md](./backend/README.md)               | API overview, rate limiting, endpoints |
| [docs/API_MIGRATION.md](./docs/API_MIGRATION.md)       | API versioning and migration notes     |
| [docs/ERROR_CODES.md](./docs/ERROR_CODES.md)           | Error code catalog                     |
| [docs/WEBSOCKET.md](./docs/WEBSOCKET.md)               | Realtime websocket channel             |
| [docs/REFERRAL_REWARDS.md](./docs/REFERRAL_REWARDS.md) | On-chain referral rewards design       |

## Operations & deployment

| Document                                                   | What it covers                 |
| ---------------------------------------------------------- | ------------------------------ |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)                 | Deployment procedures          |
| [docs/STAGING_DEPLOYMENT.md](./docs/STAGING_DEPLOYMENT.md) | Staging environment deploy     |
| [docs/TESTNET.md](./docs/TESTNET.md)                       | Testnet operations             |
| [docs/MAINNET_CHECKLIST.md](./docs/MAINNET_CHECKLIST.md)   | Production readiness checklist |
| [docs/KUBERNETES.md](./docs/KUBERNETES.md)                 | Kubernetes / Helm manifests    |
| [docs/RUNBOOK.md](./docs/RUNBOOK.md)                       | Incident and ops runbook       |
| [docs/SLO.md](./docs/SLO.md)                               | Service level objectives       |
| [docs/RELEASE_PROCESS.md](./docs/RELEASE_PROCESS.md)       | Release engineering workflow   |

## Quality, security & testing

| Document                                                             | What it covers           |
| -------------------------------------------------------------------- | ------------------------ |
| [docs/E2E_TESTING.md](./docs/E2E_TESTING.md)                         | End-to-end test strategy |
| [docs/SECURITY_XSS_PREVENTION.md](./docs/SECURITY_XSS_PREVENTION.md) | XSS prevention controls  |
| [docs/BROWSER_COMPATIBILITY.md](./docs/BROWSER_COMPATIBILITY.md)     | Supported browsers       |
| [docs/CAMPAIGN_CREATION.md](./docs/CAMPAIGN_CREATION.md)             | Campaign creation guide  |
| [docs/GOVERNANCE.md](./docs/GOVERNANCE.md)                           | Project governance       |

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Production deployment guide with environment matrix
- Error codes documentation with frontend-friendly message mapping
- Release process documentation with semantic versioning policy
- Backend API request schema documentation with curl examples
- Error mapping utility for frontend error handling
- Backend `.env.example` configuration template
- Backend distributed tracing via OpenTelemetry (#288) — auto-instrumentation of Express + outbound
  HTTP, manual spans for DB / Soroban RPC / job runner, `traceparent` propagated to the frontend.
- Frontend CLI + UI for Merkle allowlist proof generation (#294) — `scripts/generate-merkle.mjs`,
  browser-compatible `merkle.js` helper, admin upload flow, `docs/MERKLE_ALLOWLIST.md` walkthrough.
- Frontend transaction history page (#295) — `/history` route querying Horizon `operations` filtered
  to the rewards + campaign contract IDs, paginated cursor view, Header link visible when wallet is
  connected.

### Changed

- Improved documentation structure for operators and contributors
- **BREAKING (contract storage)**: campaign participant records moved from instance storage to
  persistent storage (#280). Per-user data no longer counts against the 64KB instance cap, lifting
  the practical participant ceiling from ~1.8k to "as many as TTL economics allow".
  `PARTICIPANT_COUNT` aggregate stays in instance storage. See `docs/upgradeability.md` for the
  deployer migration path on already-live campaigns.

## [0.1.0] - 2024-04-01

### Added

- Initial release of Trivela platform
- Campaign contract with Merkle allowlist support
- Rewards contract with points tracking and claims
- Backend REST API with campaign CRUD operations
- Frontend React application with campaign browsing and wallet integration
- Health checks and metrics endpoints
- Rate limiting and optional API key authentication
- Comprehensive architecture documentation
- Contribution guidelines

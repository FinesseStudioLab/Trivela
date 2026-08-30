# Advanced Contract Features, Observability, and Wallet UX Improvements

## Summary
This PR introduces massive architectural improvements across the Trivela stack to improve security, observability, and user experience. 

## Changes

### 1. Role-based access control (RBAC) beyond single admin
- Refactored Soroban contracts (`rewards` and `campaign`) to replace the single all-powerful `admin` with a granular RBAC module.
- Introduced specific roles: `admin`, `operator`, `pauser`, `treasurer`.
- Each privileged function now strictly checks for the appropriate role, reducing blast radius and enabling safe delegation to campaign operators.

### 2. Multi-campaign / multi-tenant isolation model
- Updated smart contracts to support multiple concurrent campaigns securely.
- Namespaced storage and reserves per campaign ID.
- Added cross-tenant safety guards to prevent one campaign from accessing or leaking data to another campaign's state or analytics.

### 3. Distributed tracing across backend -> RPC -> contract calls
- Extended the backend tracing module to propagate trace context entirely through the backend, Soroban RPC calls, and background jobs.
- Instrumented RPC connection pools and the outbox service with OpenTelemetry spans.
- Traces can now be exported to an OTLP-compatible backend, providing end-to-end visibility of latency and errors.

### 4. Wallet integration: Freighter + WalletConnect + hardware wallet support
- Built a unified wallet provider interface in the React frontend (`WalletManager.js`).
- Implemented full support for Freighter and WalletConnect (v2).
- Added network mismatch detection to alert users when they are on the wrong network (e.g. mainnet vs testnet).
- Handled seamless account switching events and state restoration.

## Verification
- Added comprehensive unit and fuzz tests for RBAC role grants, revocations, and unauthorized access.
- Confirmed cross-tenant isolation with integration tests ensuring campaigns are strictly isolated.
- Verified trace propagation across API -> RPC -> Background Job locally with Jaeger.
- Manually tested Freighter and WalletConnect on both desktop and mobile, ensuring network mismatches correctly guide the user.

## Closes
Closes #894
Closes #893
Closes #875
Closes #863

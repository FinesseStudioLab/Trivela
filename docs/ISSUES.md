# Trivela – Contributor Issues (50)

Use this list to create GitHub issues. Each entry has a **title**, **description**, and **labels**
(area, difficulty, and optional `good first issue`). Create the labels in your repo first:
`area: backend`, `area: frontend`, `area: smart-contract`, `area: documentation`,
`difficulty: easy`, `difficulty: medium`, `difficulty: hard`, `good first issue`, `help wanted`.

---

## Smart contract (18 issues)

### 1. Add events to rewards contract for credit and claim

**Labels:** `area: smart-contract` `difficulty: easy` `good first issue`  
**Description:** Emit Soroban events in the rewards contract when `credit` and `claim` are called
(e.g. user, amount). Document event names and payload in contract README or inline docs.

### 2. Add TTL extension for campaign contract storage keys

**Labels:** `area: smart-contract` `difficulty: easy`  
**Description:** In the campaign contract, add `extend_ttl` for instance storage (e.g. after
`set_active` and `register`) so entries don’t expire too soon. Use similar pattern to the rewards
contract.

### 3. Add max cap for single credit in rewards contract

**Labels:** `area: smart-contract` `difficulty: easy`  
**Description:** Add a configurable maximum amount per `credit` call (stored in contract or
admin-set). Return a dedicated error when exceeded.

### 4. Add campaign cap (max participants) in campaign contract

**Labels:** `area: smart-contract` `difficulty: medium`  
**Description:** Add an optional max number of participants. When set, `register` should fail with a
clear error when the cap is reached. Add storage and (if needed) an admin setter.

### 5. Implement batch credit in rewards contract

**Labels:** `area: smart-contract` `difficulty: medium`  
**Description:** Add a function that credits multiple users in one call (e.g.
`batch_credit(env, from, [(user, amount), ...])`) to reduce transaction count.

### 6. Add admin transfer in rewards contract

**Labels:** `area: smart-contract` `difficulty: easy`  
**Description:** Allow admin to transfer points from one user to another (debit source, credit
destination) with auth checks.

### 7. Add contract metadata (name, symbol) to rewards contract

**Labels:** `area: smart-contract` `difficulty: easy` `good first issue`  
**Description:** Expose a `metadata()` or similar view that returns contract name and optional
symbol/decimals for the frontend.

### 8. Add pause/unpause to rewards contract

**Labels:** `area: smart-contract` `difficulty: medium`  
**Description:** Add a paused flag (admin-only set). When paused, `credit` and `claim` should revert
with a clear error.

### 9. Add campaign start/end time checks in campaign contract

**Labels:** `area: smart-contract` `difficulty: medium`  
**Description:** Store optional start and end ledger (or timestamp) and ensure `register` and any
reward logic only succeed within the window.

### 10. Add unit tests for rewards contract edge cases

**Labels:** `area: smart-contract` `difficulty: easy` `good first issue`  
**Description:** Add tests for: claim more than balance (expect error), credit overflow, double
register in campaign, uninitialized access.

### 11. Add unit tests for campaign contract

**Labels:** `area: smart-contract` `difficulty: easy` `good first issue`  
**Description:** Expand campaign contract tests: set_active only by admin, register when inactive,
is_participant for unknown address.

### 12. Add custom error enum for campaign contract

**Labels:** `area: smart-contract` `difficulty: easy`  
**Description:** Replace generic errors with a `#[contracterror]` enum (e.g. Unauthorized,
CampaignInactive, CapReached) and use it in all fallible functions.

### 13. Add deploy script for testnet

**Labels:** `area: smart-contract` `difficulty: medium`  
**Description:** Add a script (bash or Node) that builds both contracts and deploys them to Stellar
testnet, outputting contract IDs (and optionally saving to .env or config).

### 14. Add integration test: rewards + campaign flow

**Labels:** `area: smart-contract` `difficulty: hard`  
**Description:** Write an integration test that: initializes both contracts, registers a user in
campaign, credits and claims in rewards, asserts final balances and events.

### 15. Add Merkle-based eligibility in campaign contract

**Labels:** `area: smart-contract` `difficulty: hard`  
**Description:** Allow registering participants via Merkle proof (root stored in contract, optional)
so large allowlists can be used without storing every address.

### 16. Document Soroban contract build and deploy in README

**Labels:** `area: smart-contract` `area: documentation` `difficulty: easy` `good first issue`  
**Description:** Add a “Building and deploying contracts” section to the root or contracts README
with exact `stellar contract build` and `stellar contract deploy` commands and required env
(network, identity).

### 17. Add fuzzing for rewards balance logic

**Labels:** `area: smart-contract` `difficulty: hard`  
**Description:** Add a fuzz target (e.g. with cargo-fuzz or Soroban testutils) that randomizes
credit/claim sequences and asserts invariants (e.g. sum of balances + total_claimed is consistent).

### 18. Add upgradeability pattern doc for contracts

**Labels:** `area: smart-contract` `area: documentation` `difficulty: medium`  
**Description:** Document how we could make the rewards or campaign contract upgradeable (e.g.
deployer pattern, migration steps) and add a short “Future: upgradeability” section in docs.

---

## Backend (16 issues)

### 19. Add GET /api/campaigns filter by active

**Labels:** `area: backend` `difficulty: easy` `good first issue`  
**Description:** Support query param `?active=true|false` on GET /api/campaigns and filter the list
accordingly.

### 20. Add POST /api/campaigns to create campaign

**Labels:** `area: backend` `difficulty: easy`  
**Description:** Add POST /api/campaigns with body (name, description, rewardPerAction, etc.) and
append to in-memory list (or stub for DB later). Return 201 and the created campaign.

### 21. Add PUT /api/campaigns/:id

**Labels:** `area: backend` `difficulty: easy`  
**Description:** Update an existing campaign by id (name, description, active, rewardPerAction).
Return 404 if not found.

### 22. Add DELETE /api/campaigns/:id

**Labels:** `area: backend` `difficulty: easy`  
**Description:** Remove a campaign by id from the in-memory store. Return 404 if not found.

### 23. Add request logging middleware

**Labels:** `area: backend` `difficulty: easy` `good first issue`  
**Description:** Add middleware to log method, path, status, and duration for each request (e.g.
with a simple logger or `morgan`).

### 24. Add rate limiting for API routes

**Labels:** `area: backend` `difficulty: medium`  
**Description:** Add rate limiting (e.g. per IP or per API key) to prevent abuse. Use a simple
in-memory store or a library; document in README.

### 25. Add validation for campaign body (POST/PUT)

**Labels:** `area: backend` `difficulty: easy`  
**Description:** Validate request body (required name, non-negative rewardPerAction, etc.) and
return 400 with clear error messages when invalid.

### 26. Add SQLite or PostgreSQL for campaigns

**Labels:** `area: backend` `difficulty: medium`  
**Description:** Replace in-memory campaigns with a database. Add migrations or schema and implement
GET/POST/PUT/DELETE against the DB.

### 27. Add GET /api/config (Soroban RPC, network)

**Labels:** `area: backend` `difficulty: easy` `good first issue`  
**Description:** Return public config (e.g. SOROBAN_RPC_URL, STELLAR_NETWORK, optional contract IDs)
so the frontend can use one source of truth.

### 28. Add health check for Soroban RPC

**Labels:** `area: backend` `difficulty: medium`  
**Description:** In /health or a separate /health/rpc, call the configured Soroban RPC (e.g.
getLedgerEntries or getNetwork) and include status in the response.

### 29. Add CORS configuration via env

**Labels:** `area: backend` `difficulty: easy`  
**Description:** Read CORS allowed origins from env (e.g. comma-separated) and configure the CORS
middleware accordingly. Default to a safe value for production.

### 30. Add unit tests for campaign CRUD

**Labels:** `area: backend` `difficulty: easy` `good first issue`  
**Description:** Add tests for GET/POST/PUT/DELETE campaigns (status codes, response shape, 404 on
missing id).

### 31. Add Dockerfile for backend

**Labels:** `area: backend` `difficulty: easy`  
**Description:** Add a Dockerfile that builds and runs the Node backend. Document how to run with
docker run and env vars.

### 32. Add API versioning (e.g. /api/v1/)

**Labels:** `area: backend` `difficulty: medium`  
**Description:** Introduce /api/v1/ prefix for all API routes and document in README. Keep backward
compatibility or add a short migration note.

### 33. Add pagination for GET /api/campaigns

**Labels:** `area: backend` `difficulty: medium`  
**Description:** Support ?page=1&limit=10 (or offset/limit). Return campaigns plus total count or
next page info.

### 34. Add optional API key auth for write endpoints

**Labels:** `area: backend` `difficulty: medium`  
**Description:** Protect POST/PUT/DELETE with an optional API key (header or query). If key is
configured, require it; otherwise allow open (for dev). Document in README.

---

## Frontend (16 issues)

### 35. Add campaign list loading and error states

**Labels:** `area: frontend` `difficulty: easy` `good first issue`  
**Description:** Show a loading spinner while fetching campaigns and an error message if the request
fails. Disable or hide list until loaded.

### 36. Add campaign detail page with route

**Labels:** `area: frontend` `difficulty: easy`  
**Description:** Add a route (e.g. /campaign/:id) and a detail page that fetches GET
/api/campaigns/:id and displays full campaign info.

### 37. Add Stellar wallet connect (Freighter or generic)

**Labels:** `area: frontend` `difficulty: medium`  
**Description:** Integrate a Stellar wallet (e.g. Freighter) to connect/disconnect and display
truncated public key. Use @stellar/stellar-sdk and wallet docs.

### 38. Display connected wallet balance (XLM or testnet)

**Labels:** `area: frontend` `difficulty: medium`  
**Description:** After wallet connect, fetch account balance via Horizon or RPC and show it in the
UI (e.g. in header or sidebar).

### 39. Add “My points” from rewards contract

**Labels:** `area: frontend` `difficulty: medium`  
**Description:** Call the deployed rewards contract `balance(user)` via Soroban RPC and display the
result for the connected wallet. Handle not deployed / RPC errors.

### 40. Add form to create campaign (call API)

**Labels:** `area: frontend` `difficulty: easy`  
**Description:** Add a form (name, description, reward per action) that submits to POST
/api/campaigns and then refetches or redirects to the new campaign.

### 41. Add global error boundary

**Labels:** `area: frontend` `difficulty: easy` `good first issue`  
**Description:** Add a React error boundary that catches render errors and shows a friendly message
and a “Retry” or “Go home” action.

### 42. Add responsive layout for mobile

**Labels:** `area: frontend` `difficulty: easy`  
**Description:** Improve layout and typography for small screens (e.g. stack elements, readable font
size, touch-friendly buttons).

### 43. Add dark mode toggle

**Labels:** `area: frontend` `difficulty: easy` `good first issue`  
**Description:** Add a theme toggle (light/dark) and persist preference (localStorage). Apply CSS
variables or class for theme.

### 44. Add E2E test with Playwright or Cypress

**Labels:** `area: frontend` `difficulty: medium`  
**Description:** Add one E2E test: open app, ensure campaigns list or empty state loads, optionally
click into a campaign. Document how to run.

### 45. Add env-based API URL and contract IDs

**Labels:** `area: frontend` `difficulty: easy`  
**Description:** Read API base URL and (optional) rewards/campaign contract IDs from VITE\_\* env
and use them in fetch and Soroban calls. Document in frontend README.

### 46. Add “Register” button that calls campaign contract

**Labels:** `area: frontend` `difficulty: hard`  
**Description:** For connected wallet, add a “Register in campaign” button that builds and submits a
transaction to the campaign contract’s `register(participant)`. Show success/error and refresh
participant status.

### 47. Add “Claim” flow for rewards contract

**Labels:** `area: frontend` `difficulty: hard`  
**Description:** Add UI to enter amount and call rewards contract `claim(user, amount)`. Sign with
connected wallet and show tx result and updated balance.

### 48. Add basic accessibility (a11y)

**Labels:** `area: frontend` `difficulty: easy` `good first issue`  
**Description:** Improve a11y: semantic HTML, aria-labels where needed, focus styles, and ensure
keyboard navigation works for main flows.

### 49. Add CI workflow for frontend build and lint

**Labels:** `area: frontend` `difficulty: medium`  
**Description:** Add GitHub Actions workflow that runs npm install, npm run build, and (if present)
lint/test for the frontend on PR and push to main.

### 50. Add Storybook and stories for main components

**Labels:** `area: frontend` `difficulty: medium`  
**Description:** Set up Storybook and add stories for at least: campaign card, empty state, and
header (with optional wallet). Document how to run in README.

---

**Summary**

- **Smart contract:** 18 (easy: 7, medium: 7, hard: 4)
- **Backend:** 16 (easy: 10, medium: 6)
- **Frontend:** 16 (easy: 8, medium: 6, hard: 2)
- **Total:** 50

Create these issues in GitHub and apply the labels so contributors can filter by area and
difficulty. You can use
[GitHub’s issue templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests)
or a script with the API (with PAT) to bulk-create them.

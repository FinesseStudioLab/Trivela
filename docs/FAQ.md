# Frequently Asked Questions

> Quick answers to the most common setup, contract, and contribution questions for Trivela
> contributors. See also: [CONTRIBUTING.md](../CONTRIBUTING.md) · [README.md](../README.md) ·
> [STELLAR_NETWORKS.md](STELLAR_NETWORKS.md)

---

## Table of Contents

- [Setup Issues](#setup-issues)
- [Contract Issues](#contract-issues)
- [Contributing](#contributing)
- [Getting Testnet XLM](#getting-testnet-xlm)

---

## Setup Issues

### ❓ "Freighter is not detected"

**Symptom:** The wallet connect button shows "Freighter not detected" or the `getPublicKey()` call
returns `undefined`.

**Fix:**

1. Install the [Freighter browser extension](https://www.freighter.app/) (Chrome / Brave / Firefox).
2. Open Freighter and create or import a wallet — the extension must be **unlocked**.
3. Check that Freighter is **enabled for the current site**: click the extension icon → Settings →
   Connected Sites.
4. If using Brave, disable Brave Shields for `localhost`.
5. Reload the page **after** unlocking Freighter; the wallet API is injected at page load.

> **Note:** Freighter only injects its API after the extension is fully loaded. Calling
> `window.freighter` too early (before `DOMContentLoaded`) will return `undefined` even when the
> extension is installed.

---

### ❓ "Soroban RPC connection refused"

**Symptom:** `fetch` errors pointing at `https://soroban-testnet.stellar.org` or
`http://localhost:8000`, contract calls time out.

**Fix:**

1. Open `.env` (frontend or backend) and verify `VITE_SOROBAN_RPC_URL` is set correctly:
   - **Testnet:** `https://soroban-testnet.stellar.org`
   - **Mainnet:** `https://soroban-mainnet.stellar.org`
   - **Local Stellar quickstart:** `http://localhost:8000/soroban/rpc`
2. Confirm the network in Freighter matches: Settings → Network → **Testnet** (for development).
3. If using the local quickstart, run `docker ps` to verify the container is running.
4. The testnet RPC can be rate-limited; add retry logic or switch to a private RPC endpoint for load
   testing.

---

### ❓ "SQLite locked error" (backend)

**Symptom:** `SQLITE_BUSY: database is locked` in the backend logs.

**Fix:**

1. Only **one** backend process may hold the SQLite write lock at a time. Run
   `lsof | grep trivela.db` and kill any zombie `node` processes.
2. Do not run `npm run dev` and `npm run test` simultaneously against the same database file — use
   separate `TEST_DATABASE_URL` in `.env.test`.
3. If running inside Docker, ensure you are not mounting the same DB volume into multiple
   containers.

---

### ❓ "npm install fails with peer dependency errors"

**Symptom:** `npm ERR! peer dep missing` or `npm ERR! Conflicting peer dependency` on Node 18 or
earlier.

**Fix:**

```bash
# Option 1 — legacy peer resolution (Node < 20)
npm install --legacy-peer-deps

# Option 2 — upgrade Node
nvm use 20          # or: nvm install 20 && nvm use 20
npm install
```

Check your Node version with `node --version`. The project targets **Node 20 LTS**.

---

## Contract Issues

### ❓ "Contract not deployed" / `VITE_REWARDS_CONTRACT_ID` missing

**Symptom:** The frontend shows "Contract not deployed" or throws `missing contractId`.

**Fix:**

1. Run the deploy script from the project root:
   ```bash
   cd contracts
   npm run deploy:testnet       # or: make deploy
   ```
2. Copy the printed contract ID into your `.env`:
   ```
   VITE_REWARDS_CONTRACT_ID=CXXX...
   ```
3. Restart the dev server (`npm run dev`) so Vite picks up the new env var.
4. Double-check that the contract ID belongs to the **same network** (testnet vs mainnet) that
   Freighter is connected to.

---

### ❓ "Authorization error when calling claim"

**Symptom:** `HostError: Error(Auth, InvalidAction)` or `Error: Authorization failed`.

**Fix:**

- You must be connected with the **exact wallet address** that earned the campaign points. Points
  are non-transferable.
- If you just funded a new wallet, it has no points — use an address that has interacted with the
  campaign contract.
- Check that Freighter is set to the **same network** as the deployed contract.
- Clear stale session: disconnect wallet, reload, reconnect.

---

### ❓ "Simulation failed: HostError"

**Symptom:** `simulate_transaction` returns a `HostError`, preflight fails.

**Common causes and fixes:**

| Error substring                | Meaning                                        | Fix                                                  |
| ------------------------------ | ---------------------------------------------- | ---------------------------------------------------- |
| `Error(WasmVm, InvalidAction)` | Contract WASM not uploaded / wrong contract ID | Redeploy; verify contract ID                         |
| `Error(Contract, #10)`         | Contract-specific error code                   | Check `ERROR_CODES.md`                               |
| `Error(Auth, InvalidAction)`   | Auth failure                                   | See "Authorization error" above                      |
| `missing network passphrase`   | Wrong network                                  | Match Freighter network to `STELLAR_NETWORK` env var |

If none of the above applies, add `--verbose` to the Stellar CLI simulate call and paste the full
error into a GitHub issue.

---

## Contributing

### ❓ "My PR is failing CI but tests pass locally"

**Symptom:** CI shows test failures that you cannot reproduce with `npm test`.

**Most likely cause:** Node version mismatch.

```bash
node --version          # check your local version
cat .nvmrc              # the version CI uses
nvm use                 # switch to the project version
npm ci && npm test      # clean install, then test
```

If tests still diverge, compare environment variables — CI uses the secrets in `.github/workflows/`;
locally you use `.env`. Never commit real secrets.

---

### ❓ "How do I get testnet XLM?"

Use **Friendbot** — the Stellar testnet faucet:

```bash
# Via curl
curl "https://friendbot.stellar.org?addr=YOUR_PUBLIC_KEY"

# Via Stellar Laboratory
# https://laboratory.stellar.org/#account-creator?network=test
```

Each call funds the account with **10 000 XLM** on testnet. You can call it repeatedly on the same
address. Testnet XLM has no real-world value.

Freighter also has a built-in "Fund with Friendbot" button in Settings → Network → Testnet.

---

### ❓ "My issue was auto-closed without being resolved"

Trivela uses an **issue rotation policy** to keep the backlog actionable:

- Issues with no activity for **30 days** are automatically labelled `stale` and closed after a
  further 7-day grace period.
- If your issue was closed prematurely, **reopen it** with a comment explaining why it is still
  relevant.
- To prevent stale closure, leave a progress comment at least once every two weeks.

---

### ❓ "How do I link to this FAQ in a new GitHub issue?"

A GitHub issue template is provided at `.github/ISSUE_TEMPLATE/bug_report.md` with a checklist that
points to this document before filing. Please confirm you have reviewed the FAQ before submitting.

---

## Still stuck?

1. Search [existing issues](https://github.com/FinesseStudioLab/Trivela/issues) — your question may
   already be answered.
2. Join the Discord `#trivela-contributors` channel for real-time help.
3. Open a new issue with the `question` label — include your OS, Node version, and the full error
   output.

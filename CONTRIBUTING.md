# Contributing to Trivela

> 💡 **Stuck on setup?** The [FAQ](docs/FAQ.md) covers the most common issues — Freighter detection, RPC errors, SQLite locks, and more. Check it first before opening an issue.
> 🔤 New to Stellar/Soroban terminology? Check the **[Glossary](docs/GLOSSARY.md)** for quick definitions of XDR, TTL, Soroban RPC, instance storage, and all Trivela-specific terms.

Thank you for considering contributing to Trivela. This project is part of the [Stellar Wave on Drips](https://www.drips.network/wave/stellar) and we welcome contributions across **backend**, **frontend**, and **smart contracts**.

## How to contribute

1. **Find an issue** – Check the [Issues](https://github.com/FinesseStudioLab/Trivela/issues) tab. We use labels:
   - `area: backend` – Node/Express API
   - `area: frontend` – React/Vite UI
   - `area: smart-contract` – Soroban (Rust) contracts
   - `good first issue` – Great for first-time contributors
   - `difficulty: easy` / `difficulty: medium` / `difficulty: hard`

2. **Comment** – Comment on the issue to say you’re working on it (and avoid duplicate work).

3. **Fork & branch** – Fork the repo and create a branch (e.g. `fix/issue-123` or `feat/campaign-filters`).

4. **Code** – Follow existing style, add tests where relevant, and keep commits focused.

5. **Pull request** – Open a PR against `main` with a clear title and reference the issue (e.g. `Fixes #123`). Ensure CI (if any) passes.

## Setup for development

- **Contracts**: Rust + Stellar CLI. From repo root: `cargo test --workspace` and `stellar contract build` in each contract dir.
- **Backend**: `cd backend && npm install && npm run dev`
- **Frontend**: `cd frontend && npm install && npm run dev`

See the main [README](README.md) for full setup.

## Code standards

- **Rust**: `cargo fmt` and `cargo clippy`; no warnings in contracts.
- **JS/TS**: Consistent formatting (e.g. project style); no unnecessary dependencies.
- **Commits**: Clear, present-tense messages (e.g. “Add GET /api/campaigns filter by active”).

## Questions

Open a [Discussion](https://github.com/FinesseStudioLab/Trivela/discussions) or tag maintainers in an issue.

Thank you for helping make Trivela better for the Stellar ecosystem.

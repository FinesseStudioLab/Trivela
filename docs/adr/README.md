# Architecture Decision Records (ADRs)

This directory captures the key architectural decisions made for Trivela.

ADRs explain **why** a technology or approach was chosen, not just what was chosen.
New contributors should read these before proposing changes to foundational choices.

## Index

| # | Title | Status |
|---|-------|--------|
| [ADR-001](0001-sqlite-over-postgresql.md) | Use SQLite for campaign database | Accepted |
| [ADR-002](0002-soroban-over-evm.md) | Use Soroban (Stellar) over EVM chains | Accepted |
| [ADR-003](0003-express-over-fastify.md) | Use Express over Fastify for the backend API | Accepted |
| [ADR-004](0004-freighter-first-wallet.md) | Freighter as the primary wallet integration | Accepted |

## Format

Each ADR follows this structure:

- **Status**: Proposed / Accepted / Deprecated / Superseded by ADR-XXX
- **Context**: What was the situation that drove the decision?
- **Decision**: What did we decide?
- **Consequences**: What are the trade-offs?

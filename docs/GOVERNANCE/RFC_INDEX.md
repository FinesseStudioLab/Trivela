# RFC Index & Decision Log

All significant architectural and protocol decisions in the Trivela project are recorded here.

## How the RFC Process Works

1. **Proposal** — Open a GitHub issue titled `RFC: <title>` and paste the
   [RFC template](RFC_TEMPLATE.md).
2. **Discussion** — At least two core contributors must review and comment within 7 days.
3. **Decision** — A maintainer updates the RFC status:
   - `Accepted` — will be implemented
   - `Rejected` — with a rationale comment
   - `Superseded` — links to the RFC that replaces it
4. **Implementation** — The PR that implements an Accepted RFC must reference the RFC number in its
   description (e.g. `Implements RFC-0003`).
5. **Close** — After the PR merges, the RFC status is set to `Accepted` and this index is updated.

> Minor changes (bug fixes, dependency bumps, docs) do not require an RFC.  
> An RFC is needed when a change affects the public API, data model, security model, or on-chain
> protocol.

---

## Accepted RFCs

| #                                            | Title                                   | Author         | Merged  | Summary                                                        |
| -------------------------------------------- | --------------------------------------- | -------------- | ------- | -------------------------------------------------------------- |
| [RFC-0001](RFC-0001-hmac-request-signing.md) | HMAC Request Signing for Partner Routes | @Williams-1604 | 2026-07 | Optional HMAC-SHA256 + replay protection for admin/partner API |
| [RFC-0002](RFC-0002-interactive-api-docs.md) | Interactive API Docs via Swagger UI     | @Williams-1604 | 2026-07 | Swagger UI at `/docs` served from existing `openapi.yaml`      |

## Draft / Under Review

_None currently._

## Rejected / Superseded

_None currently._

---

## Key Decisions (Backfill)

These decisions were made before the RFC process was established; they are recorded here for
historical context.

| Date    | Decision                                                   | Rationale                                                                                     |
| ------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 2024-Q3 | Express.js backend (not NestJS) for `backend/src/`         | Simpler dependency tree; NestJS retained for `src/` (the NestJS app) to support existing code |
| 2024-Q3 | SQLite for dev/test, PostgreSQL for production             | Avoids Docker requirement for local development                                               |
| 2025-Q1 | OpenAPI-first design — `openapi.yaml` as source of truth   | Enables contract testing, codegen, and the interactive playground                             |
| 2025-Q2 | Redis for rate-limit, nonce store, and distributed locking | Avoids in-process state fragility in multi-instance deployments                               |

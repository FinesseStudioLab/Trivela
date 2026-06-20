# ADR-003: Use Express over Fastify for the backend API

**Status:** Accepted  
**Date:** 2024-12-01

## Context

The Trivela backend needs an HTTP framework for the `/api/v1` campaign endpoints, health checks, and
metrics scraping. Options considered: Express, Fastify, Hono, Koa, raw `http` module.

## Decision

Use **Express 4.x** with standard middleware (`morgan`, `helmet`, `express-rate-limit`).

## Reasons

1. **Contributor familiarity** — Express is the most widely known Node.js framework. Lowering the
   onboarding bar matters more than raw throughput for this service tier.
2. **Ecosystem maturity** — every required middleware (logging, rate limiting, CORS, security
   headers) has a battle-tested Express package with years of production use.
3. **Sufficient performance** — campaign API calls are low-frequency and I/O-bound (SQLite reads).
   The throughput difference between Express and Fastify is irrelevant at this scale.
4. **Simpler plugin model** — Fastify's plugin/encapsulation model adds indirection that is
   unnecessary complexity for a small service with a handful of route groups.

## Consequences

- **Positive:** Any Node.js developer can read and contribute to the backend without learning a new
  framework's idioms.
- **Positive:** Extensive documentation, Stack Overflow answers, and LLM training data for Express
  patterns.
- **Negative:** Express 4.x has no built-in schema validation; request/response types must be
  validated manually or via `zod`. Fastify's JSON Schema validation would have caught some bugs
  automatically.
- **Negative:** Express 5.x is in beta (async error propagation improvements); migration will be
  needed at some point.

## Future

If throughput becomes a concern (e.g. high-frequency metrics polling), evaluate Fastify 4.x with
`@fastify/sensible` and `fastify-plugin`. Update this ADR at that time.

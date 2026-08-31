# RFC-0002: Interactive API Docs via Swagger UI

| Field      | Value          |
| ---------- | -------------- |
| RFC Number | 0002           |
| Author(s)  | @Williams-1604 |
| Status     | Accepted       |
| Created    | 2026-07-01     |
| Updated    | 2026-07-29     |

## Summary

Expose the existing `openapi.yaml` spec through a Swagger UI playground at `/docs`, embedded in the
developer portal at `/dev-portal`.

## Motivation

The OpenAPI spec already exists (2 000+ lines). Integrators have no interactive way to explore or
test endpoints without a third-party tool. Serving Swagger UI from the backend itself closes this
gap with minimal additional dependencies.

## Detailed Design

### Route

`GET /docs` — served by `swagger-ui-express` using the bundled `backend/openapi.yaml`.

The developer portal HTML (`devPortal.js`) already includes an `<iframe src="/docs">`; this RFC
wires up the missing route so that iframe renders.

### Implementation

In `backend/src/index.js`:

```js
import swaggerUi from 'swagger-ui-express';
import { load as yamlLoad } from 'js-yaml';

// ... inside createApp:
const swaggerSpec = yamlLoad(readFileSync(openApiPath, 'utf8'));
app.use('/docs', swaggerUi.serve);
app.get(
  '/docs',
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Trivela API Reference',
    swaggerOptions: { persistAuthorization: true },
  }),
);
```

`swagger-ui-express` and `js-yaml` are already production dependencies.

### Keeping Docs in Sync

- `npm run openapi:validate` — validates the spec via `@readme/openapi-parser` (already exists).
- `npm run openapi:lint` — lints via `@redocly/cli` (already exists).
- Add both to the CI pipeline to fail on spec drift.

## Alternatives Considered

- **Redoc** — cleaner read-only UI; already scripted via `docs:build`. Kept as a complementary
  offline artifact; Swagger UI wins for the interactive playground because it supports `Try it out`.
- **External hosting (ReadMe, Stoplight)** — adds a third-party dependency and manual sync step.
  Self-hosting from the existing spec is zero-maintenance.

## Acceptance Criteria

- [x] `GET /docs` returns Swagger UI with the full Trivela spec
- [x] `/dev-portal` iframe renders the playground
- [x] `openapi:validate` and `openapi:lint` scripts documented in this RFC

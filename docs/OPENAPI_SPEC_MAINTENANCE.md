# OpenAPI Spec Maintenance Guide

## Executive Summary

This document describes the process for maintaining Trivela's OpenAPI specification in sync with the Express backend routes. The system ensures 100% route coverage through automated validation in CI and prevents spec/code drift.

## Background

### Problem
API specifications often drift from actual implementation:
- New routes added without updating the spec
- Route changes not reflected in documentation
- Generated SDK clients become outdated
- API consumers see inconsistent behavior

### Solution
- **Automated Coverage Validation**: CI checks that all Express routes are in the OpenAPI spec
- **Drift Detection**: CI fails if generated clients are out of sync
- **Compilation Verification**: Generated TypeScript client must compile successfully
- **Spec Linting**: Spectral validates OpenAPI best practices

## Architecture

### Components

1. **OpenAPI Spec**: `backend/openapi.yaml` - Single source of truth for API documentation
2. **Coverage Validator**: `backend/scripts/validate-openapi-coverage.js` - Ensures all routes are documented
3. **CI Workflow**: `.github/workflows/openapi-validation.yml` - Runs validation on every PR/push
4. **Legacy Workflow**: `.github/workflows/openapi-codegen.yml` - Original codegen drift check
5. **Spectral Config**: `backend/.spectral.yaml` - Linting rules for spec quality
6. **Generated Client**: `sdk/client/` - TypeScript SDK generated from spec

### CI Pipeline

```
┌─────────────────┐
│  PR/Push Event  │
└────────┬────────┘
         │
         ▼
┌────────────────────────────────┐
│  validate-spec                 │
│  • Check route coverage        │
│  • Lint with Spectral          │
└────────┬───────────────────────┘
         │ (must pass)
         ▼
┌────────────────────────────────┐
│  codegen-drift                 │
│  • Regenerate TypeScript client│
│  • Check for git diff          │
│  • Verify client compiles      │
│  • Run client tests            │
└────────┬───────────────────────┘
         │ (must pass)
         ▼
┌────────────────────────────────┐
│  validate-examples             │
│  • Validate example payloads   │
└────────────────────────────────┘
```

## Coverage Validation

### How It Works

The validator script (`validate-openapi-coverage.js`) performs the following:

1. **Parse OpenAPI Spec**: Load and validate `backend/openapi.yaml`
2. **Extract Express Routes**: Parse `backend/src/index.js` to find all `app.get|post|put|patch|delete` calls
3. **Normalize Paths**: Convert Express `:param` syntax to OpenAPI `{param}` syntax
4. **Compare**: Check that each Express route has a corresponding OpenAPI path
5. **Report**: List any missing or extra routes

### Running Locally

```bash
# Validate coverage
node backend/scripts/validate-openapi-coverage.js

# Expected output when valid:
# ✅ OpenAPI version: 3.1.0
# ✅ API title: Trivela API
# ✅ API version: 0.1.0
# 
# 📝 Routes in code: 127
# 📝 Routes in spec: 125
# 📝 Excluded routes: 10
# 
# ✅ VALIDATION PASSED: All routes are documented
```

### Excluded Routes

The following routes are intentionally excluded from validation (internal/diagnostic endpoints):

- `GET /health`, `/health/live`, `/health/ready`, `/health/rpc`, `/health/indexer`
- `GET /livez`, `/readyz`, `/healthz`, `/ready`
- `GET /metrics`
- `GET /__dev__/*` (development-only routes)

To add more exclusions, edit `EXCLUDED_ROUTES` in `backend/scripts/validate-openapi-coverage.js`.

## Adding New Routes

### Step-by-Step Process

1. **Implement the route** in `backend/src/index.js` (or route files)

```javascript
app.post(`${prefix}/campaigns/:id/participants`, rateLimiter, idempotencyMiddleware, (req, res) => {
  // Implementation
});
```

2. **Add to OpenAPI spec** in `backend/openapi.yaml`

```yaml
paths:
  /v1/campaigns/{id}/participants:
    post:
      summary: Add participant to campaign
      operationId: addCampaignParticipant
      tags:
        - Campaigns
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
          description: Campaign ID
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - address
              properties:
                address:
                  type: string
                  description: Stellar address
            example:
              address: "GBXXX..."
      responses:
        '201':
          description: Participant added successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Participant'
        '400':
          $ref: '#/components/responses/BadRequest'
        '404':
          $ref: '#/components/responses/NotFound'
      security:
        - ApiKeyAuth: []
```

3. **Regenerate the TypeScript client**

```bash
cd sdk/client
npm run generate
```

4. **Verify changes**

```bash
# Validate coverage
node backend/scripts/validate-openapi-coverage.js

# Check client compiles
cd sdk/client
npm run build

# Check for drift
git diff sdk/client/src/
```

5. **Commit all changes**

```bash
git add backend/openapi.yaml sdk/client/src/
git commit -m "feat: add POST /campaigns/:id/participants endpoint"
```

### CI Will Verify

When you push:
- ✅ All routes are documented
- ✅ Generated client matches spec
- ✅ Client compiles without errors
- ✅ Spec follows best practices (Spectral linting)

## Spectral Linting

### What It Checks

The Spectral linter validates:

1. **Required Fields**
   - All operations have `operationId` (needed for code generation)
   - All operations have `description`
   - All operations have `tags`

2. **Parameter Quality**
   - Parameters have descriptions
   - Parameter names follow camelCase convention
   - Path parameters are defined in the path

3. **Response Quality**
   - Success responses are defined (200, 201, etc.)
   - Error responses (4xx, 5xx) reference `Error` schema
   - Examples are provided for responses

4. **Security**
   - Operations have security requirements defined
   - Security schemes are properly configured

5. **Custom Trivela Rules**
   - POST/PUT/PATCH operations have request bodies
   - List operations document pagination (`data`, `total`, `limit`, `offset`)
   - Error responses use consistent `Error` schema

### Running Locally

```bash
# Install Spectral CLI
npm install -g @stoplight/spectral-cli

# Lint the spec
spectral lint backend/openapi.yaml --ruleset backend/.spectral.yaml

# Example output:
# backend/openapi.yaml
#  105:9  warning  operation-description  Operation should have a description  paths./v1/campaigns.post
#  142:9  warning  operation-tags         Operation should specify tags        paths./v1/campaigns.post
```

### Fixing Linting Issues

Most issues are warnings (won't fail CI) but should be addressed for quality:

```yaml
# Before (missing description and tags)
paths:
  /v1/campaigns:
    post:
      operationId: createCampaign
      # ...

# After (complete documentation)
paths:
  /v1/campaigns:
    post:
      summary: Create a new campaign
      description: |
        Creates a new campaign with the specified configuration.
        Requires campaigns:write scope.
      operationId: createCampaign
      tags:
        - Campaigns
      # ...
```

## Generated Client

### TypeScript SDK

Location: `sdk/client/`

The TypeScript client is automatically generated from `backend/openapi.yaml` using OpenAPI Generator.

### Regenerating

```bash
cd sdk/client
npm run generate
```

This will:
1. Read `backend/openapi.yaml`
2. Generate TypeScript interfaces and API client
3. Output to `sdk/client/src/`

### Using the Client

```typescript
import { Configuration, CampaignsApi } from '@trivela/client';

const config = new Configuration({
  basePath: 'https://api.trivela.io',
  apiKey: 'your-api-key',
});

const campaignsApi = new CampaignsApi(config);

// All methods are fully typed based on OpenAPI spec
const campaign = await campaignsApi.createCampaign({
  name: 'Summer Campaign 2026',
  startDate: '2026-06-01T00:00:00Z',
  endDate: '2026-08-31T23:59:59Z',
});
```

### Compilation Verification

CI ensures the generated client compiles:

```bash
cd sdk/client
npm run build
```

If the spec has invalid schemas or missing references, compilation will fail and CI will catch it.

## Best Practices

### 1. Keep Spec in Sync

**DO**: Update `openapi.yaml` when adding/modifying routes  
**DON'T**: Merge PRs that fail OpenAPI validation

### 2. Use Operation IDs

**DO**: Assign meaningful, unique `operationId` to every operation  
**DON'T**: Leave operations without IDs (breaks code generation)

```yaml
# Good
operationId: getCampaignById

# Bad (missing)
operationId: # <-- CI will warn
```

### 3. Document All Parameters

**DO**: Provide description and examples for every parameter  
**DON'T**: Leave parameters undocumented

```yaml
# Good
parameters:
  - name: id
    in: path
    required: true
    description: Unique campaign identifier
    schema:
      type: string
    example: "clhfj2kn40000356nqj8h0zl0"

# Bad
parameters:
  - name: id
    in: path
    required: true
    schema:
      type: string
```

### 4. Use Shared Schemas

**DO**: Reference components for common types  
**DON'T**: Inline duplicate schemas

```yaml
# Good
responses:
  '200':
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/Campaign'

# Bad (duplicated everywhere)
responses:
  '200':
    content:
      application/json:
        schema:
          type: object
          properties:
            id:
              type: string
            name:
              type: string
            # ... 20 more fields
```

### 5. Provide Examples

**DO**: Include realistic request/response examples  
**DON'T**: Leave examples empty or generic

```yaml
# Good
example:
  name: "Summer Campaign 2026"
  startDate: "2026-06-01T00:00:00Z"
  endDate: "2026-08-31T23:59:59Z"
  budget: 100000

# Bad
example:
  name: "string"
  startDate: "string"
```

## Troubleshooting

### Problem: Coverage validation fails

```
❌ MISSING ROUTES IN OPENAPI SPEC:
   POST /v1/campaigns/:id/participants
```

**Solution**: Add the route to `backend/openapi.yaml` following the format above

---

### Problem: Generated client has drift

```
❌ ERROR: The generated TypeScript client in sdk/client/src/ is out of date.
```

**Solution**:
```bash
cd sdk/client
npm run generate
git add src/
git commit -m "chore: regenerate client from updated OpenAPI spec"
```

---

### Problem: Client compilation fails

```
error TS2304: Cannot find name 'InvalidSchema'.
```

**Solution**: The spec has an undefined reference. Check for typos in `$ref` values:

```yaml
# Check for
$ref: '#/components/schemas/InvalidSchema'  # <-- Typo or missing schema

# Should be
$ref: '#/components/schemas/Error'
```

---

### Problem: Spectral linting warnings

```
warning operation-operationId Operation "post" must have "operationId".
```

**Solution**: Add missing `operationId` to every operation

---

### Problem: Route excluded but shouldn't be

Edit `EXCLUDED_ROUTES` in `backend/scripts/validate-openapi-coverage.js` and remove it.

## Monitoring

### Metrics to Track

1. **Spec Coverage**: Percentage of routes documented
2. **CI Success Rate**: How often validation passes on first try
3. **Drift Frequency**: How often generated client has uncommitted changes
4. **Spectral Warnings**: Count of linting issues over time

### Alerts

Set up GitHub Actions notifications for:
- OpenAPI validation failures
- Generated client compilation errors
- Spec drift detected

## References

- [OpenAPI 3.1 Specification](https://spec.openapis.org/oas/v3.1.0)
- [Spectral Documentation](https://stoplight.io/open-source/spectral)
- [OpenAPI Generator](https://openapi-generator.tech/)
- [OpenAPI Best Practices](https://oai.github.io/Documentation/best-practices.html)

---

**Document Version**: 1.0  
**Last Updated**: August 2026  
**Review Date**: February 2027  
**Owner**: Trivela API Team  
**Related Issue**: #861

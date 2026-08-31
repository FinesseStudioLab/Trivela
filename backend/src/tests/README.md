# Backend API Snapshot Tests

## Overview

API snapshot tests ensure that response structures remain stable over time. Any changes to API
response shapes require explicit acknowledgment by updating snapshots.

## Purpose

**Why snapshot tests?**

- **Frontend safety**: Prevents breaking changes to API contracts that frontend/SDK consumers depend
  on
- **Documentation**: Snapshots serve as executable documentation of API response formats
- **Change awareness**: Forces developers to explicitly review and approve API shape changes
- **Regression prevention**: Catches unintended response structure modifications

## Running Tests

### Run all snapshot tests

```bash
npm run test:snapshots
```

### Update snapshots (after intentional API changes)

```bash
npm run test:snapshots:update
```

### Run in CI

```bash
node --test src/tests/api-snapshot.test.js
```

## Covered Endpoints

### Campaign API

- ✅ `GET /api/v1/campaigns` - Campaign list with pagination
- ✅ `GET /api/v1/campaigns/:id` - Single campaign details
- ✅ `GET /api/v1/campaigns/:id/stats` - Campaign statistics
- ✅ `POST /api/v1/campaigns` - Create campaign response

### Health & Status

- ✅ `GET /health` - Basic health check
- ✅ `GET /api/v1/health` - Detailed health with service status

### Error Responses

- ✅ `404 Not Found` - Resource not found
- ✅ `400 Bad Request` - Validation errors with details
- ✅ `429 Too Many Requests` - Rate limit exceeded
- ✅ `500 Internal Server Error` - Server errors

### Common Patterns

- ✅ Pagination metadata structure
- ✅ Webhook event payloads
- ✅ Analytics overview
- ✅ API key creation response

## How It Works

1. **Snapshot Creation**: First run generates JSON snapshots in `__snapshots__/` directory
2. **Comparison**: Subsequent runs compare actual responses against stored snapshots
3. **Shape Validation**: Tests verify:
   - All expected keys are present
   - No unexpected keys added
   - Data types match (string, number, object, array)
   - Nested object structures remain consistent

## When to Update Snapshots

Update snapshots when you **intentionally** change:

- Adding new fields to responses
- Removing deprecated fields
- Changing field names or types
- Restructuring nested objects
- Modifying error response formats

**DO NOT** update snapshots to make tests pass without reviewing the changes!

## Workflow Example

### Scenario: Adding a new field to campaign response

1. **Make code changes** to add `priority` field to campaigns
2. **Run tests** - they will fail showing the diff:
   ```
   Snapshot mismatch for "campaign-detail":
   root.priority: unexpected key in actual response
   ```
3. **Review the change** - confirm it's intentional
4. **Update snapshot**:
   ```bash
   npm run test:snapshots:update
   ```
5. **Commit snapshot files** with your changes
6. **Document the change** in API changelog/migration guide

## Snapshot Files

Snapshots are stored as JSON in `src/tests/__snapshots__/`:

- `campaigns-list.json` - Campaign list response shape
- `campaign-detail.json` - Single campaign shape
- `error-404.json` - 404 error response shape
- etc.

## CI Integration

Snapshot tests run automatically in the backend CI pipeline:

- **On PR**: Tests validate that no unintended API changes occurred
- **Failure**: PR blocked until snapshots updated or code reverted
- **Success**: API contract confirmed stable

## Best Practices

### 1. Keep snapshots minimal

Only include structural information, not actual data values:

```json
{
  "id": 1, // ✅ Example value for type inference
  "name": "string", // ✅ Shows field is string
  "tags": ["string"] // ✅ Shows array of strings
}
```

### 2. Test representative shapes

Include examples of:

- Empty arrays and objects
- Null values where applicable
- All enum/variant types

### 3. Version snapshots

When making breaking changes:

```bash
# Create v2 snapshots for new API version
cp campaign-detail.json campaign-detail-v2.json
# Update v2 snapshot for new shape
UPDATE_SNAPSHOTS=1 node --test src/tests/api-snapshot.test.js
```

### 4. Document breaking changes

Update API documentation when snapshots change:

- Migration guide for consumers
- Changelog entry with before/after shapes
- Deprecation notices for removed fields

## Troubleshooting

### Test fails with "missing in actual response"

A required field was removed or renamed. This is a **breaking change**.

- Restore the field, OR
- Update consumers first, then update snapshot

### Test fails with "unexpected key in actual response"

A new field was added. This is **backward compatible**.

- Review if the field should be optional
- Update snapshot to accept the new field

### Test fails with "type mismatch"

Field type changed (e.g., string → number). This is a **breaking change**.

- Ensure consumers can handle the new type
- Consider API versioning if incompatible

## Adding New Snapshot Tests

```javascript
test('GET /api/v1/new-endpoint - response shape', () => {
  const mockResponse = {
    // Define expected shape with example values
    data: {
      id: 1,
      name: 'Example',
      items: [{ id: 1, value: 100 }],
    },
  };

  assertMatchesSnapshot('new-endpoint', mockResponse);
});
```

Then generate the snapshot:

```bash
npm run test:snapshots:update
```

## Related Documentation

- [OpenAPI Contract Tests](../integration/openapi-contract.test.js)
- [Backend API Reference](../../README.md)
- [Frontend Integration Guide](../../../frontend/README.md)

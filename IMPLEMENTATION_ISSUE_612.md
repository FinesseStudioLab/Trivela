# Implementation: Organization Audit Log & Activity Feed (Issue #612)

## Overview

This implementation adds comprehensive organization-scoped audit logging and activity feed
functionality to Trivela, enabling organizations to track and monitor all actions performed within
their organization scope.

## Features Implemented

### 1. Database Schema Enhancement

- **Migration 015**: Added `org_id` column to `audit_logs` table
- **Indexes**: Created composite indexes for efficient org-scoped queries
- **PostgreSQL Support**: Updated PostgreSQL schema with corresponding changes

### 2. Enhanced Audit Log Repository

- **Organization Scoping**: All audit log queries can now be filtered by organization
- **Advanced Filtering**: Support for filtering by actor, action, entity, date ranges
- **Pagination**: Built-in pagination support with limit/offset
- **Counting**: Efficient count queries for pagination metadata

### 3. Audit Log Service Layer

- **Organization Context**: Automatic organization context handling
- **Activity Descriptions**: Human-readable activity descriptions
- **Export Functionality**: CSV and JSON export with proper escaping
- **Statistics**: Comprehensive audit statistics and analytics

### 4. RESTful API Endpoints

- `GET /api/v1/orgs/:orgId/audit` - Organization audit logs with filtering
- `GET /api/v1/orgs/:orgId/audit/export/csv` - CSV export
- `GET /api/v1/orgs/:orgId/audit/export/json` - JSON export
- `GET /api/v1/orgs/:orgId/audit/stats` - Audit statistics
- `GET /api/v1/orgs/:orgId/activity-feed` - Activity feed for dashboard

### 5. Security & Access Control

- **Organization Isolation**: Users can only access their own organization's audit logs
- **Permission-Based**: Requires `audit:read` permission
- **API Key Authentication**: Integrated with existing auth middleware

## Technical Details

### Database Schema Changes

```sql
-- Added to audit_logs table
ALTER TABLE audit_logs ADD COLUMN org_id TEXT;

-- New indexes for performance
CREATE INDEX idx_audit_logs_org_id ON audit_logs(org_id);
CREATE INDEX idx_audit_logs_org_entity ON audit_logs(org_id, entity);
CREATE INDEX idx_audit_logs_org_action ON audit_logs(org_id, action);
CREATE INDEX idx_audit_logs_org_created_at ON audit_logs(org_id, created_at);
```

### API Examples

#### Get Organization Audit Logs

```bash
GET /api/v1/orgs/org-123/audit?page=1&pageSize=50&action=create&startDate=2024-01-01
```

#### Export to CSV

```bash
GET /api/v1/orgs/org-123/audit/export/csv?entity=campaign&startDate=2024-01-01
```

#### Activity Feed

```bash
GET /api/v1/orgs/org-123/activity-feed?limit=20
```

### Response Formats

#### Audit Logs Response

```json
{
  "success": true,
  "data": [
    {
      "id": "123",
      "actor": "apiKey:ab12...ef34",
      "action": "create",
      "entity": "campaign",
      "entityId": "camp-456",
      "orgId": "org-123",
      "diff": { "after": { "name": "New Campaign" } },
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalCount": 150,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

#### Activity Feed Response

```json
{
  "success": true,
  "data": [
    {
      "id": "123",
      "actor": "apiKey:ab12...ef34",
      "action": "create",
      "entity": "campaign",
      "entityId": "camp-456",
      "orgId": "org-123",
      "timestamp": "2024-01-15T10:30:00Z",
      "description": "apiKey:ab12...ef34 created campaign \"camp-456\""
    }
  ]
}
```

#### Audit Statistics Response

```json
{
  "success": true,
  "data": {
    "totalActions": 1250,
    "actionBreakdown": {
      "create": 450,
      "update": 600,
      "delete": 200
    },
    "entityBreakdown": {
      "campaign": 800,
      "apiKey": 250,
      "webhook": 200
    },
    "topActors": [
      { "actor": "apiKey:ab12...ef34", "count": 425 },
      { "actor": "apiKey:cd56...gh78", "count": 380 }
    ]
  }
}
```

## Implementation Files

### Backend Files Created/Modified

1. **Migration**: `backend/src/db/migrations/015_audit_logs_org_scoped.js`
2. **Repository**: `backend/src/dal/sqliteAuditLogRepository.js` (enhanced)
3. **Interface**: `backend/src/dal/auditLogRepository.js` (enhanced)
4. **Service**: `backend/src/services/auditLogService.js` (new)
5. **Routes**: `backend/src/routes/audit.js` (new)
6. **Main App**: `backend/src/index.js` (enhanced)
7. **PostgreSQL Schema**: `backend/src/dal/pg/migrations/001_initial_schema.sql` (updated)

### Test Files Created/Modified

1. **Repository Tests**: `backend/tests/integration/auditLogRepository.test.js` (enhanced)
2. **Service Tests**: `backend/tests/integration/auditLogService.test.js` (new)
3. **Test Setup**: `backend/tests/integration/setup.js` (enhanced)

## Key Features

### 1. Organization Scoping

All audit log operations are scoped to organizations. When creating audit entries, the system
automatically includes the organization context from the authenticated user.

### 2. Advanced Filtering

- **Actor filtering**: Filter by specific API keys or users
- **Action filtering**: Filter by specific actions (create, update, delete, etc.)
- **Entity filtering**: Filter by resource types (campaign, apiKey, etc.)
- **Date range filtering**: Filter by start/end dates
- **Combined filtering**: Multiple filters can be combined

### 3. Export Capabilities

- **CSV Export**: Properly escaped CSV with all audit data
- **JSON Export**: Structured JSON with metadata and filters applied
- **Large Dataset Support**: Handles up to 10,000 records per export

### 4. Activity Feed

- **Human-readable descriptions**: Converts raw audit data to readable activity descriptions
- **Recent activity focus**: Optimized for dashboard display
- **Configurable limits**: Adjustable result limits (default 20, max 50)

### 5. Performance Optimizations

- **Database indexes**: Optimized indexes for org-scoped queries
- **Pagination**: Efficient pagination with proper counting
- **Query optimization**: Optimized SQL queries for filtering and sorting

## Security Considerations

### 1. Organization Isolation

- Users can only access audit logs for their own organization
- API endpoints validate organization membership
- Database queries are automatically scoped to user's organization

### 2. Permission-Based Access

- Requires `audit:read` permission for all audit endpoints
- Uses existing RBAC system for access control
- API key authentication required for all endpoints

### 3. Data Privacy

- Actor information is anonymized (shows key prefixes, not full keys)
- Sensitive diff data is preserved but access-controlled
- Export functionality respects organization boundaries

## Testing

The implementation includes comprehensive tests covering:

- Database schema and migrations
- Repository functionality with all filters
- Service layer with organization scoping
- Export functionality (CSV/JSON)
- Activity feed generation
- Pagination and counting
- Edge cases and error handling

## Usage Examples

### Frontend Integration

The audit log and activity feed can be integrated into admin dashboards:

```javascript
// Fetch recent activity for dashboard
const activityFeed = await fetch(`/api/v1/orgs/${orgId}/activity-feed?limit=10`);

// Get filtered audit logs
const auditLogs = await fetch(`/api/v1/orgs/${orgId}/audit?action=create&page=1`);

// Export audit data
const csvData = await fetch(`/api/v1/orgs/${orgId}/audit/export/csv`);
```

### Analytics and Monitoring

Organizations can now:

- Track all administrative actions
- Monitor API key usage patterns
- Export compliance reports
- Generate activity dashboards
- Investigate security incidents

## Performance Characteristics

- **Indexed queries**: All org-scoped queries use database indexes
- **Pagination**: Efficient pagination prevents large result sets
- **Export limits**: Exports capped at 10K records to prevent timeouts
- **Memory efficiency**: Streaming approach for large datasets
- **Cache-friendly**: Consistent query patterns enable caching

## Future Enhancements

Potential future improvements:

1. **Real-time notifications**: WebSocket-based activity notifications
2. **Advanced search**: Full-text search across audit descriptions
3. **Retention policies**: Automatic cleanup of old audit data
4. **Additional export formats**: PDF, Excel export options
5. **Audit log replay**: Ability to replay sequence of actions
6. **Integration hooks**: Webhook notifications for specific audit events

## Conclusion

This implementation provides a comprehensive audit logging and activity feed system that enables
organizations to:

- Track all administrative actions within their organization
- Export audit data for compliance and analysis
- Monitor activity through dashboard feeds
- Maintain security and access control
- Scale efficiently with proper indexing and pagination

The system is built with security, performance, and usability in mind, providing a solid foundation
for organizational audit tracking and compliance requirements.

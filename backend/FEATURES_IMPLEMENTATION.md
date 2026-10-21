# Backend Features Implementation

This document describes the newly implemented backend features for Trivela.

## 1. Soroban Transaction Submitter Service (#1248)

**File**: `src/services/sorobanTransactionSubmitter.js`

A service for submitting Soroban transactions with proper nonce queue management to prevent transaction conflicts.

### Usage

```javascript
import { SorobanTransactionSubmitter } from './services/sorobanTransactionSubmitter.js';

const submitter = new SorobanTransactionSubmitter({
  rpcClient: sorobanRpcClient,
  db: database,
});

// Submit transaction (nonce handled automatically)
const result = await submitter.submitTransaction('account-id', rawTransactionData);

// Track transaction status
const status = await submitter.trackTransactionStatus('tx-hash');
```

### Features

- Automatic nonce sequencing per account
- Transaction queuing with FIFO processing
- Duplicate nonce prevention
- Transaction status tracking
- Error handling and logging

### Database Schema

- `soroban_transactions`: Tracks all submitted transactions
- `soroban_nonce_state`: Maintains current nonce per account

## 2. Database Backup and Recovery Service (#1250)

**File**: `src/services/databaseBackupService.js`

Automated daily database backup with point-in-time recovery capabilities.

### Usage

```javascript
import { DatabaseBackupService } from './services/databaseBackupService.js';

const backupService = new DatabaseBackupService({
  db: database,
  backupDir: './backups',
});

await backupService.initialize();

// Create backup
const backup = await backupService.createBackup('daily');

// List available backups
const backups = await backupService.listBackups();

// Restore from backup
await backupService.restoreFromBackup('/path/to/backup.db');
```

### Features

- Automatic daily backup creation
- Backup rotation (keeps 30 days by default)
- Point-in-time recovery
- Recovery backup creation before restoring
- Backup listing and metadata

### Database Schema

- `database_backups`: Tracks backup files and metadata
- `backup_recovery_log`: Records recovery operations

### Job Integration

Run daily backups using the scheduled job:

```javascript
import { runDatabaseBackupJob } from './jobs/databaseBackupJob.js';

// Scheduled to run at 2 AM daily
await runDatabaseBackupJob({ db });
```

## 3. PostgreSQL Read Replica Query Splitting Middleware (#1254)

**File**: `src/middleware/readReplicaRouter.js`

Middleware for routing database queries to read replicas and write operations to primary.

### Usage

```javascript
import { ReadReplicaRouter } from './middleware/readReplicaRouter.js';

const router = new ReadReplicaRouter({
  primaryPool: primaryConnection,
  replicaPools: [replica1, replica2], // Optional
});

// Use as middleware
app.use(router.middleware());

// Manual routing
const readResult = await router.executeQuery(selectSql, params);
const writeResult = await router.executeQuery(insertSql, params);
```

### Features

- Automatic read/write query detection
- Round-robin replica selection
- Connection pooling support
- Health check integration
- Request-level query routing
- Transaction support

### Database Schema

- `read_replica_config`: Stores replica configuration
- `replica_health_checks`: Tracks replica health status

## 4. Database Schema Migration Framework (#1249)

### Two Approaches

#### A. Native Better-SQLite3 Migrations

**File**: `src/db/migrate.js` (existing)

- Simple JavaScript/SQL migration files
- Versioning with numeric prefixes (NNN_description.js)
- Transaction support
- Used for most schema changes

Example:
```javascript
export const version = 46;
export const description = 'Soroban transaction queue';

export function up(db) {
  db.exec(`
    CREATE TABLE soroban_transactions (...)
  `);
}
```

#### B. Knex.js Migration Framework

**Files**:
- `src/db/knexConfig.js`: Configuration
- `src/db/knexMigrationRunner.js`: Runner with rollback
- `src/db/knex-migrations/`: Migration directory

### Usage

```javascript
import { runMigrations, rollbackMigrations } from './db/knexMigrationRunner.js';

// Run pending migrations
await runMigrations();

// Rollback last batch
await rollbackMigrations();

// Check status
const status = await getMigrationStatus();
```

### Features

- Version control with batches
- Rollback support
- Multi-environment configuration (SQLite, PostgreSQL)
- Seed support
- Status checking

## Environment Variables

```env
DB_PATH=./trivela.db                    # SQLite database path
BACKUP_DIR=./backups                    # Backup directory
DATABASE_URL=postgresql://user:pass@... # PostgreSQL (for Knex)
NODE_ENV=development|test|production    # Environment
```

## Testing

Run tests for new services:

```bash
npm run test:backend -- sorobanTransactionSubmitter.test.js
```

## Integration Points

### Server Initialization

```javascript
import { SorobanTransactionSubmitter } from './services/sorobanTransactionSubmitter.js';
import { DatabaseBackupService } from './services/databaseBackupService.js';
import { ReadReplicaRouter } from './middleware/readReplicaRouter.js';

// Initialize services in your main server file
const sorobanSubmitter = new SorobanTransactionSubmitter({ rpcClient, db });
const backupService = new DatabaseBackupService({ db });
const readRouter = new ReadReplicaRouter({ primaryPool, replicaPools });

app.use(readRouter.middleware());
```

## Monitoring and Logging

All services use the standard logger and log important events:

- Transaction submissions and failures
- Backup creation and rotation
- Database replica health checks
- Migration status changes

Check logs for:
```
soroban:tx:submitted      - Transaction sent
backup:created:success    - Backup completed
db:query:routing          - Query routing decision
migration:*               - Migration events
```

## Error Handling

Services throw descriptive errors:

- `Soroban submission failed`: RPC error during submission
- `Backup operation failed`: Filesystem or DB error
- `Migration failed`: Schema validation error

Handle errors in application code:

```javascript
try {
  await submitter.submitTransaction(account, tx);
} catch (error) {
  if (error.code === -32600) {
    // Invalid nonce - retry logic
  }
}
```

## Performance Considerations

1. **Soroban Submitter**: Nonce queue prevents concurrent submission issues
2. **Backups**: Runs at off-peak hours (2 AM), keeps disk usage bounded
3. **Read Replica Router**: Round-robin balancing without extra overhead
4. **Migrations**: Batched with transaction support, no downtime

## Future Enhancements

- [ ] Automatic replica failover
- [ ] Backup encryption
- [ ] Progressive nonce recovery
- [ ] Migration dry-run mode

#!/usr/bin/env bash
# scripts/restore-db.sh — Restore database from an encrypted backup.
#
# Usage:
#   DATABASE_URL=postgresql://... ./scripts/restore-db.sh <backup-path>
#   DATABASE_URL=postgresql://... BACKUP_DECRYPTION_KEY=key.txt \
#     ./scripts/restore-db.sh s3://bucket/backups/2025/06/27/backup.dump.gz.age
#
# Arguments:
#   $1 — Local file path or S3 URI of the backup to restore.
#
# Environment variables:
#   DATABASE_URL                — Target PostgreSQL connection string (required)
#   BACKUP_DECRYPTION_KEY       — Private key file for age decryption (if encrypted)
#   SMOKE_TEST_ENABLED          — Run smoke queries after restore (default: true)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Configuration ─────────────────────────────────────────────────────────────
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DECRYPTION_KEY="${BACKUP_DECRYPTION_KEY:-}"
SMOKE_TEST_ENABLED="${SMOKE_TEST_ENABLED:-true}"
BACKUP_SOURCE="${1:?Usage: restore-db.sh <backup-path>}"

# ── Pre-flight checks ────────────────────────────────────────────────────────
command -v pg_restore >/dev/null 2>&1 || { echo "ERROR: pg_restore not found"; exit 1; }

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# ── Fetch backup ──────────────────────────────────────────────────────────────
if [[ "$BACKUP_SOURCE" == s3://* ]]; then
  command -v aws >/dev/null 2>&1 || { echo "ERROR: AWS CLI not found"; exit 1; }
  echo "Downloading backup from S3..."
  aws s3 cp "$BACKUP_SOURCE" "$TMP_DIR/backup"
  BACKUP_FILE="$TMP_DIR/backup"
elif [[ -f "$BACKUP_SOURCE" ]]; then
  cp "$BACKUP_SOURCE" "$TMP_DIR/backup"
  BACKUP_FILE="$TMP_DIR/backup"
else
  echo "ERROR: Backup source not found: $BACKUP_SOURCE" >&2
  exit 1
fi

# ── Fetch and verify checksum ─────────────────────────────────────────────────
CHECKSUM_SOURCE="${BACKUP_SOURCE%.*}"
if [[ "$BACKUP_SOURCE" == s3://* ]]; then
  CHECKSUM_FILE="${CHECKSUM_SOURCE}.sha256"
  if aws s3 ls "$CHECKSUM_FILE" >/dev/null 2>&1; then
    aws s3 cp "$CHECKSUM_FILE" "$TMP_DIR/checksum.txt"
  fi
elif [[ -f "${BACKUP_SOURCE%.*}.sha256" ]]; then
  cp "${BACKUP_SOURCE%.*}.sha256" "$TMP_DIR/checksum.txt"
fi

if [[ -f "$TMP_DIR/checksum.txt" ]]; then
  echo "Verifying checksum..."
  if echo "$(cat "$TMP_DIR/checksum.txt")  $BACKUP_FILE" | sha256sum -c -; then
    echo "✓ Checksum verified"
  else
    echo "ERROR: Checksum verification failed" >&2
    exit 1
  fi
else
  echo "WARNING: No checksum file found, skipping verification"
fi

# ── Decrypt (optional) ────────────────────────────────────────────────────────
if [[ -n "$BACKUP_DECRYPTION_KEY" ]]; then
  command -v age >/dev/null 2>&1 || { echo "ERROR: age not found"; exit 1; }
  echo "Decrypting backup..."
  age -d -i "$BACKUP_DECRYPTION_KEY" -o "$TMP_DIR/backup.dec" "$BACKUP_FILE"
  BACKUP_FILE="$TMP_DIR/backup.dec"
  echo "✓ Decrypted"
fi

# ── Decompress ────────────────────────────────────────────────────────────────
if file "$BACKUP_FILE" | grep -q gzip; then
  echo "Decompressing..."
  gunzip -f "$BACKUP_FILE"
  BACKUP_FILE="${BACKUP_FILE%.gz}"
fi

# ── Restore ───────────────────────────────────────────────────────────────────
echo "Restoring database..."
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname "$DATABASE_URL" "$BACKUP_FILE"

echo "✓ Database restored"

# ── Re-point indexer cursor ───────────────────────────────────────────────────
# The indexer_checkpoints table tracks the last synced ledger. After a restore,
# the cursor should match the backup's snapshot.
echo "Checking indexer cursor..."
pg_restore --list "$BACKUP_FILE" 2>/dev/null | grep -q "indexer_checkpoints" && \
  echo "  Indexer checkpoints table present in backup" || \
  echo "  No indexer checkpoints in backup (new DB?)"

# ── Smoke tests ───────────────────────────────────────────────────────────────
if [[ "$SMOKE_TEST_ENABLED" == "true" ]]; then
  echo ""
  echo "Running smoke queries..."
  FAILED=0

  # Query 1: Schema migrations table exists and has entries
  MIGRATION_COUNT=$(psql "$DATABASE_URL" -t -A -c \
    "SELECT COUNT(*) FROM _schema_migrations" 2>/dev/null || echo "-1")
  if [[ "$MIGRATION_COUNT" != "-1" ]]; then
    echo "  ✓ Schema migrations table: ${MIGRATION_COUNT} migrations applied"
  else
    echo "  ✗ Schema migrations table missing"
    FAILED=$((FAILED + 1))
  fi

  # Query 2: Campaigns table accessible
  CAMPAIGN_COUNT=$(psql "$DATABASE_URL" -t -A -c \
    "SELECT COUNT(*) FROM campaigns" 2>/dev/null || echo "-1")
  if [[ "$CAMPAIGN_COUNT" != "-1" ]]; then
    echo "  ✓ Campaigns table: ${CAMPAIGN_COUNT} campaigns"
  else
    echo "  ✗ Campaigns table missing"
    FAILED=$((FAILED + 1))
  fi

  # Query 3: Audit logs table accessible
  AUDIT_COUNT=$(psql "$DATABASE_URL" -t -A -c \
    "SELECT COUNT(*) FROM audit_logs" 2>/dev/null || echo "-1")
  if [[ "$AUDIT_COUNT" != "-1" ]]; then
    echo "  ✓ Audit logs table: ${AUDIT_COUNT} entries"
  else
    echo "  ✗ Audit logs table missing"
    FAILED=$((FAILED + 1))
  fi

  # Query 4: API keys table accessible
  APIKEY_COUNT=$(psql "$DATABASE_URL" -t -A -c \
    "SELECT COUNT(*) FROM api_keys" 2>/dev/null || echo "-1")
  if [[ "$APIKEY_COUNT" != "-1" ]]; then
    echo "  ✓ API keys table: ${APIKEY_COUNT} keys"
  else
    echo "  ✗ API keys table missing"
    FAILED=$((FAILED + 1))
  fi

  if [[ "$FAILED" -gt 0 ]]; then
    echo ""
    echo "ERROR: ${FAILED} smoke query(ies) failed" >&2
    exit 1
  fi

  echo ""
  echo "✓ All smoke queries passed"
fi

echo ""
echo "✓ Restore complete"

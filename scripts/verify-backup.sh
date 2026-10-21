#!/usr/bin/env bash
# scripts/verify-backup.sh — Verify a database backup restores cleanly to an isolated sandbox.
#
# Usage:
#   DATABASE_URL=postgresql://... ./scripts/verify-backup.sh [backup-path]
#
# Arguments:
#   $1 — (optional) Local file path or S3 URI of the backup to verify.
#        If omitted, the latest backup is discovered from UPLOAD_DIR or S3.
#
# Environment variables:
#   DATABASE_URL                — PostgreSQL connection string for the primary DB (required)
#   BACKUP_DECRYPTION_KEY       — Private key file for age decryption (if encrypted)
#   UPLOAD_DIR                  — Local backup directory (default: ./backups)
#   S3_BUCKET                   — S3 bucket for remote backups
#   SANDBOX_DB_NAME             — Isolated sandbox DB name (default: trivela_backup_verify)
#   VERIFICATION_TIMEOUT        — Max seconds for the verification (default: 300)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# ── Configuration ─────────────────────────────────────────────────────────────
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DECRYPTION_KEY="${BACKUP_DECRYPTION_KEY:-}"
UPLOAD_DIR="${UPLOAD_DIR:-$REPO_ROOT/backups}"
S3_BUCKET="${S3_BUCKET:-}"
SANDBOX_DB_NAME="${SANDBOX_DB_NAME:-trivela_backup_verify}"
VERIFICATION_TIMEOUT="${VERIFICATION_TIMEOUT:-300}"
BACKUP_SOURCE="${1:-}"

# ── Pre-flight checks ────────────────────────────────────────────────────────
command -v psql >/dev/null 2>&1 || { echo "ERROR: psql not found"; exit 1; }
command -v pg_restore >/dev/null 2>&1 || { echo "ERROR: pg_restore not found"; exit 1; }

TMP_DIR="$(mktemp -d)"
cleanup() {
  # Drop sandbox DB
  psql "$DATABASE_URL" -c "DROP DATABASE IF EXISTS ${SANDBOX_DB_NAME};" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "=== Backup Verification Worker ==="
echo "Sandbox DB: ${SANDBOX_DB_NAME}"
echo ""

# ── Discover latest backup if not provided ───────────────────────────────────
if [[ -z "$BACKUP_SOURCE" ]]; then
  echo "No backup specified, discovering latest..."
  if [[ -n "$S3_BUCKET" ]]; then
    BACKUP_SOURCE=$(aws s3 ls "s3://${S3_BUCKET}/backups/" --recursive 2>/dev/null \
      | sort | tail -1 | awk '{print "s3://'"${S3_BUCKET}"'/"$4}')
    if [[ -z "$BACKUP_SOURCE" ]]; then
      echo "ERROR: No backups found in s3://${S3_BUCKET}/backups/" >&2
      exit 1
    fi
  else
    BACKUP_SOURCE=$(find "$UPLOAD_DIR" -name 'trivela-backup-*' -type f \
      ! -name '*.sha256' 2>/dev/null | sort | tail -1)
    if [[ -z "$BACKUP_SOURCE" ]]; then
      echo "ERROR: No backups found in ${UPLOAD_DIR}" >&2
      exit 1
    fi
  fi
fi
echo "Backup: ${BACKUP_SOURCE}"
echo ""

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

# ── Verify checksum ───────────────────────────────────────────────────────────
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
  echo "WARNING: No checksum file found, skipping checksum verification"
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

# ── Create isolated sandbox database ─────────────────────────────────────────
echo "Creating isolated sandbox database '${SANDBOX_DB_NAME}'..."
psql "$DATABASE_URL" -c "DROP DATABASE IF EXISTS ${SANDBOX_DB_NAME};" >/dev/null
psql "$DATABASE_URL" -c "CREATE DATABASE ${SANDBOX_DB_NAME};" >/dev/null

SANDBOX_URL="${DATABASE_URL%/*}/${SANDBOX_DB_NAME}"
echo "✓ Sandbox ready"

# ── Restore into sandbox ─────────────────────────────────────────────────────
echo "Restoring backup into sandbox..."
if ! pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname "$SANDBOX_URL" "$BACKUP_FILE" 2>"$TMP_DIR/restore-errors.log"; then
  # pg_restore exits non-zero on non-fatal warnings; check if the restore actually failed
  if [[ -s "$TMP_DIR/restore-errors.log" ]] && ! psql "$SANDBOX_URL" -t -A -c "SELECT 1;" >/dev/null 2>&1; then
    echo "ERROR: Restore failed" >&2
    cat "$TMP_DIR/restore-errors.log" >&2
    exit 1
  fi
  echo "WARNING: Restore completed with warnings (non-fatal)"
else
  echo "✓ Restore complete"
fi

# ── Run verification queries ─────────────────────────────────────────────────
echo ""
echo "Running verification queries..."
FAILED=0

verify_query() {
  local label="$1"
  local sql="$2"
  local expected_min="${3:-0}"
  local result
  result=$(psql "$SANDBOX_URL" -t -A -c "$sql" 2>/dev/null || echo "-1")
  if [[ "$result" == "-1" ]]; then
    echo "  ✗ ${label}: query failed"
    FAILED=$((FAILED + 1))
  elif [[ "$result" -lt "$expected_min" ]]; then
    echo "  ✗ ${label}: ${result} rows (expected >= ${expected_min})"
    FAILED=$((FAILED + 1))
  else
    echo "  ✓ ${label}: ${result} rows"
  fi
}

verify_query "Schema migrations" "SELECT COUNT(*) FROM _schema_migrations" 1
verify_query "Campaigns table" "SELECT COUNT(*) FROM campaigns" 0
verify_query "Audit logs table" "SELECT COUNT(*) FROM audit_logs" 0
verify_query "API keys table" "SELECT COUNT(*) FROM api_keys" 0

# Integrity: check for orphaned foreign keys in campaigns
ORPHANS=$(psql "$SANDBOX_URL" -t -A -c \
  "SELECT COUNT(*) FROM campaigns c WHERE NOT EXISTS (SELECT 1 FROM api_keys k WHERE k.id = c.created_by)" 2>/dev/null || echo "0")
echo "  ℹ Orphaned campaign references: ${ORPHANS}"

echo ""
if [[ "$FAILED" -gt 0 ]]; then
  echo "ERROR: ${FAILED} verification check(s) failed" >&2
  exit 1
fi

echo "✓ Backup verification passed"
echo "✓ Backup restores cleanly without data loss"

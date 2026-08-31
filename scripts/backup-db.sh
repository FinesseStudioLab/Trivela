#!/usr/bin/env bash
# scripts/backup-db.sh — Scheduled encrypted database backup to object storage.
#
# Usage:
#   DATABASE_URL=postgresql://... STORAGE_BACKEND=s3 S3_BUCKET=backups \
#   BACKUP_ENCRYPTION_KEY="$(cat key.txt)" ./scripts/backup-db.sh
#
# Environment variables:
#   DATABASE_URL              — PostgreSQL connection string (required)
#   STORAGE_BACKEND           — "local" | "s3" | "ipfs" (default: local)
#   UPLOAD_DIR                — Local backup directory when STORAGE_BACKEND=local
#   S3_BUCKET                 — S3 bucket name when STORAGE_BACKEND=s3
#   AWS_REGION                — AWS region when STORAGE_BACKEND=s3
#   BACKUP_ENCRYPTION_KEY     — Public key file path for age encryption (optional)
#   BACKUP_RETENTION_DAILY    — Number of daily backups to keep (default: 7)
#   BACKUP_RETENTION_WEEKLY   — Number of weekly backups to keep (default: 4)
#   BACKUP_RETENTION_MONTHLY  — Number of monthly backups to keep (default: 6)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Configuration ─────────────────────────────────────────────────────────────
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
STORAGE_BACKEND="${STORAGE_BACKEND:-local}"
UPLOAD_DIR="${UPLOAD_DIR:-$REPO_ROOT/backups}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"
RETENTION_DAILY="${BACKUP_RETENTION_DAILY:-7}"
RETENTION_WEEKLY="${BACKUP_RETENTION_WEEKLY:-4}"
RETENTION_MONTHLY="${BACKUP_RETENTION_MONTHLY:-6}"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DATE_PATH="$(date -u +%Y/%m/%d)"
BACKUP_NAME="trivela-backup-${TIMESTAMP}"

# ── Pre-flight checks ────────────────────────────────────────────────────────
command -v pg_dump >/dev/null 2>&1 || { echo "ERROR: pg_dump not found"; exit 1; }

if [[ "$STORAGE_BACKEND" == "s3" ]]; then
  command -v aws >/dev/null 2>&1 || { echo "ERROR: AWS CLI not found"; exit 1; }
fi

# ── Dump ──────────────────────────────────────────────────────────────────────
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

DUMP_FILE="$TMP_DIR/${BACKUP_NAME}.dump"
echo "Dumping database..."
pg_dump --format=custom --compress=6 --no-owner --no-privileges \
  "$DATABASE_URL" -f "$DUMP_FILE"

SCHEMA_VERSION=$(psql "$DATABASE_URL" -t -A -c "SELECT COALESCE(MAX(version), 0) FROM _schema_migrations" 2>/dev/null || echo "unknown")
LEDGER_CURSOR=$(psql "$DATABASE_URL" -t -A -c "SELECT COALESCE(MAX(ledger), 0) FROM indexer_checkpoints" 2>/dev/null || echo "0")

# ── Checksum ──────────────────────────────────────────────────────────────────
sha256sum "$DUMP_FILE" | awk '{print $1}' > "$TMP_DIR/checksum.txt"
CHECKSUM="$(cat "$TMP_DIR/checksum.txt")"
FILESIZE="$(stat -f%z "$DUMP_FILE" 2>/dev/null || stat --format=%s "$DUMP_FILE" 2>/dev/null)"

echo "Dump complete: ${FILESIZE} bytes, SHA-256: ${CHECKSUM}"

# ── Compress ──────────────────────────────────────────────────────────────────
GZIP_FILE="${DUMP_FILE}.gz"
gzip -9 "$DUMP_FILE"
FINAL_FILE="$GZIP_FILE"

# ── Encrypt (optional) ───────────────────────────────────────────────────────
if [[ -n "$BACKUP_ENCRYPTION_KEY" ]]; then
  command -v age >/dev/null 2>&1 || { echo "ERROR: age not found"; exit 1; }
  ENCRYPTED_FILE="${FINAL_FILE}.age"
  age -R "$BACKUP_ENCRYPTION_KEY" -o "$ENCRYPTED_FILE" "$FINAL_FILE"
  FINAL_FILE="$ENCRYPTED_FILE"
  echo "Encrypted backup with age"
fi

# ── Manifest ──────────────────────────────────────────────────────────────────
MANIFEST="$TMP_DIR/manifest.json"
cat > "$MANIFEST" <<EOF
{
  "backup_name": "${BACKUP_NAME}",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "database_url_host": "$(echo "$DATABASE_URL" | sed 's|.*@||;s|/.*||')",
  "file_size_bytes": ${FILESIZE},
  "sha256_checksum": "${CHECKSUM}",
  "schema_version": ${SCHEMA_VERSION},
  "indexer_ledger_cursor": ${LEDGER_CURSOR},
  "storage_backend": "${STORAGE_BACKEND}",
  "encrypted": $([ -n "$BACKUP_ENCRYPTION_KEY" ] && echo "true" || echo "false"),
  "format": "pg_dump_custom_gzip",
  "retention": {
    "daily": ${RETENTION_DAILY},
    "weekly": ${RETENTION_WEEKLY},
    "monthly": ${RETENTION_MONTHLY}
  }
}
EOF

# ── Upload ────────────────────────────────────────────────────────────────────
case "$STORAGE_BACKEND" in
  local)
    DEST_DIR="$UPLOAD_DIR/$DATE_PATH"
    mkdir -p "$DEST_DIR"
    cp "$FINAL_FILE" "$DEST_DIR/"
    cp "$MANIFEST" "$DEST_DIR/"
    echo "Backup stored locally: $DEST_DIR/${BACKUP_NAME}.*"
    ;;
  s3)
    DEST_PREFIX="backups/$DATE_PATH"
    aws s3 cp "$FINAL_FILE" "s3://${S3_BUCKET}/${DEST_PREFIX}/$(basename "$FINAL_FILE")"
    aws s3 cp "$MANIFEST" "s3://${S3_BUCKET}/${DEST_PREFIX}/manifest.json"
    echo "Backup uploaded to s3://${S3_BUCKET}/${DEST_PREFIX}/"
    ;;
  ipfs)
    echo "ERROR: IPFS backup not yet implemented" >&2
    exit 1
    ;;
  *)
    echo "ERROR: Unknown STORAGE_BACKEND: $STORAGE_BACKEND" >&2
    exit 1
    ;;
esac

# ── Retention cleanup ─────────────────────────────────────────────────────────
echo "Applying retention policy..."
cleanup_old_backups() {
  local retention_days="$1"
  local label="$2"
  local cutoff_date
  cutoff_date=$(date -u -d "${retention_days} days ago" +%Y/%m/%d 2>/dev/null || \
                date -u -v-${retention_days}d +%Y/%m/%d 2>/dev/null || \
                echo "")

  if [[ -z "$cutoff_date" ]]; then
    echo "  Could not compute cutoff date for $label retention, skipping"
    return
  fi

  case "$STORAGE_BACKEND" in
    local)
      find "$UPLOAD_DIR" -maxdepth 3 -name "trivela-backup-*" -type f -mtime "+${retention_days}" -exec rm -f {} \;
      find "$UPLOAD_DIR" -maxdepth 3 -name "manifest.json" -type f -mtime "+${retention_days}" -exec rm -f {} \;
      ;;
    s3)
      aws s3 ls "s3://${S3_BUCKET}/backups/" --recursive 2>/dev/null | \
        awk -v cutoff="$cutoff_date" '$1 < cutoff {print $4}' | \
        while read -r key; do
          aws s3 rm "s3://${S3_BUCKET}/backups/${key}" 2>/dev/null || true
        done
      ;;
  esac
  echo "  Cleaned $label backups older than ${retention_days} days"
}

# Daily: keep last N days
cleanup_old_backups "$RETENTION_DAILY" "daily"
# Weekly: keep last N * 7 days
cleanup_old_backups "$((RETENTION_WEEKLY * 7))" "weekly"
# Monthly: keep last N * 30 days
cleanup_old_backups "$((RETENTION_MONTHLY * 30))" "monthly"

echo ""
echo "✓ Backup complete: ${BACKUP_NAME}"
echo "  Checksum: ${CHECKSUM}"
echo "  Schema version: ${SCHEMA_VERSION}"
echo "  Indexer cursor: ${LEDGER_CURSOR}"

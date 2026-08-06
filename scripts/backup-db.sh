#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Daily PostgreSQL backup (CampusGest).
# Creates a timestamped gzip dump and prunes archives older than 14 days.
#
# Cron installation (2 a.m.):
#   crontab -e
#   0 2 * * * /home/USER/campusgest/scripts/backup-db.sh >> /var/log/campusgest-backup.log 2>&1
#
# Restore:
#   gunzip -c backups/db-YYYY-MM-DD.sql.gz | \
#     docker compose -f docker-compose.prod.yml exec -T postgres psql -U campusgest campusgest
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Project directory = this script's parent.
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.prod.yml"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%F_%H%M)"
OUT="$BACKUP_DIR/db-$STAMP.sql.gz"

echo "[$(date +%FT%T)] Dump PostgreSQL → $OUT"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U campusgest campusgest | gzip > "$OUT"

# Prune archives that are too old.
find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

echo "[$(date +%FT%T)] OK — sauvegardes conservées : $(ls -1 "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | wc -l)"
echo "  ⚠ Pensez à répliquer $BACKUP_DIR hors du serveur (autre machine / stockage distant)."

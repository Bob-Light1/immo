#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Sauvegarde quotidienne de PostgreSQL (CampusGest).
# Crée un dump gzip horodaté et purge les archives de plus de 14 jours.
#
# Installation cron (2h du matin) :
#   crontab -e
#   0 2 * * * /home/USER/campusgest/scripts/backup-db.sh >> /var/log/campusgest-backup.log 2>&1
#
# Restauration :
#   gunzip -c backups/db-YYYY-MM-DD.sql.gz | \
#     docker compose -f docker-compose.prod.yml exec -T postgres psql -U campusgest campusgest
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Répertoire du projet = parent de ce script.
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

# Purge des archives trop anciennes.
find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

echo "[$(date +%FT%T)] OK — sauvegardes conservées : $(ls -1 "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | wc -l)"
echo "  ⚠ Pensez à répliquer $BACKUP_DIR hors du serveur (autre machine / stockage distant)."

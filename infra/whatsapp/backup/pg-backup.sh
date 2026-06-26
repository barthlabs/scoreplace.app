#!/usr/bin/env bash
# scoreplace.app — backup do Postgres (Evolution) -> Google Drive via rclone.
# Chamado pelo systemd timer (scoreplace-pg-backup.timer), 1x/dia.
# Variáveis vêm do /opt/scoreplace-wa/.env (EnvironmentFile do service).
set -euo pipefail

REMOTE="${GDRIVE_REMOTE:-gdrive}"
FOLDER="${GDRIVE_FOLDER:-scoreplace-wa-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
PG_CONTAINER="${PG_CONTAINER:-scoreplace-postgres}"
PG_USER="${PG_USER:-evolution}"
PG_DB="${PG_DB:-evolution}"
LOG="${BACKUP_LOG:-/var/log/scoreplace-pg-backup.log}"

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*" >> "$LOG"; }

STAMP="$(date +%Y-%m-%d_%H%M)"
FILE="evolution-${STAMP}.sql.gz"
WORKDIR="$(mktemp -d)"
TMP="${WORKDIR}/${FILE}"
trap 'rm -rf "$WORKDIR"' EXIT

log "iniciando backup -> ${REMOTE}:${FOLDER}/${FILE}"

# 1) dump + compressão (pg_dump roda DENTRO do container do Postgres)
if ! docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" | gzip > "$TMP"; then
  log "ERRO: pg_dump falhou"; exit 1
fi
SIZE="$(du -h "$TMP" | cut -f1)"

# 2) upload pro Google Drive
if ! rclone copy "$TMP" "${REMOTE}:${FOLDER}/" --log-file "$LOG" --log-level INFO; then
  log "ERRO: upload rclone falhou (remote '${REMOTE}' configurado? rode 'rclone config')"; exit 1
fi

# 3) rotação: apaga backups com mais de RETENTION_DAYS dias no Drive
rclone delete "${REMOTE}:${FOLDER}/" --min-age "${RETENTION_DAYS}d" \
  --include "evolution-*.sql.gz" --log-file "$LOG" --log-level INFO || \
  log "AVISO: rotação falhou (não crítico)"

log "OK: ${FILE} (${SIZE}) enviado; retenção ${RETENTION_DAYS} dias"

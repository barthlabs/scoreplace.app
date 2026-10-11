#!/usr/bin/env bash
# Aposenta endpoints que foram removidos do código, com confirmação explícita.
# Nunca é chamado por deploy-hosting.sh nem por deploy-functions.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="scoreplace-app"
CONFIRM="${1:-}"

if [[ "$CONFIRM" != "--confirm-retire-obsolete" || "$#" -ne 1 ]]; then
  echo "uso: scripts/retire-obsolete-functions.sh --confirm-retire-obsolete" >&2
  echo "recusado: aposentadoria de Function é uma ação destrutiva separada do deploy." >&2
  exit 2
fi

source "$ROOT/scripts/firebase-credencial-persistente.sh"
sp_preparar_credencial_firebase "$ROOT" "$PROJECT"

RETIRED=(setParticipantsProfile setParticipantsGender applyLetzplayScans)
LIST="$(firebase functions:list --project "$PROJECT" --json)"
for fn in "${RETIRED[@]}"; do
  if node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(0,"utf8"));process.exit((j.result||[]).some(f=>f.id===process.argv[1])?0:1)' "$fn" <<<"$LIST"; then
    echo "▸ aposentando Function removida: $fn"
    firebase functions:delete "$fn" --region us-central1 --project "$PROJECT" --force
  else
    echo "✓ $fn já não está publicada"
  fi
done

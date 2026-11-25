#!/usr/bin/env bash
# Publicação delimitada das regras de anexos; nunca publica nem exclui Functions.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ "${1:-}" == "--dry-run" ]]; then
  echo '(dry-run) firebase deploy --only storage --project scoreplace-app'; exit 0
fi
[[ $# -eq 0 ]] || { echo 'uso: scripts/deploy-storage-rules.sh [--dry-run]' >&2; exit 2; }
source "$ROOT/scripts/firebase-credencial-persistente.sh"
sp_preparar_credencial_firebase "$ROOT" scoreplace-app
cd "$ROOT"
firebase deploy --only storage --project scoreplace-app --non-interactive

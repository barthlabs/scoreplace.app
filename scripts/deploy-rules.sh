#!/usr/bin/env bash
# deploy-rules.sh — único caminho para publicar Firestore Rules.
#
# A CLI do Firebase prefere uma sessão OAuth de usuário quando ela existe; essa
# sessão expira. Este invólucro usa a mesma conta de serviço persistente dos
# publicadores de Functions e Hosting e carimba o corte somente após o deploy
# concluir. Não execute `firebase deploy --only firestore:rules` diretamente.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="scoreplace-app"
DRY=0

case "${1:-}" in
  '') ;;
  --dry-run) DRY=1 ;;
  *) echo "uso: scripts/deploy-rules.sh [--dry-run]" >&2; exit 2 ;;
esac

if [ "$DRY" = 1 ]; then
  echo "(dry-run) publicaria firestore.rules em $PROJECT com a credencial persistente"
  exit 0
fi

source "$ROOT/scripts/firebase-credencial-persistente.sh"
sp_preparar_credencial_firebase "$ROOT" "$PROJECT"

firebase deploy --only firestore:rules --project "$PROJECT" --non-interactive
node "$ROOT/scripts/check-backend-publicado.js" --carimbar rules
echo "✓ regras publicadas e carimbadas pela credencial persistente"

#!/usr/bin/env bash
# Publicação direcionada do Gate B1. Executar somente após revisão APROVADA e commit.
# Mantém o cliente sem operationId; não ativa a troca automática de região.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "${1:-}" = --dry-run ] && [ "$#" -eq 1 ]; then
  echo 'npm test'
  echo 'npm run test:rules'
  bash scripts/deploy-operation-receipts-ttl.sh --dry-run
  bash scripts/deploy-rules.sh --dry-run
  bash scripts/deploy-functions.sh main --only setTournamentPresence --dry-run
  bash scripts/deploy-functions.sh autodraw --only applyMatchResult,applyQueuedResult,assignMatchCourt,setTournamentPresenceWithWOSubstitution --dry-run
  echo 'scripts/deploy-operation-receipts-ttl.sh --check'
  exit 0
fi
[ "${1:-}" = --apply ] && [ "$#" -eq 1 ] || {
  echo 'uso: deploy-operation-receipts-b1.sh [--dry-run|--apply]' >&2; exit 2;
}
[ -z "$(git status --porcelain)" ] || {
  echo 'Gate B1 exige commit e árvore limpa antes de publicar' >&2; exit 1;
}
node scripts/sync-operation-receipt-core.js --check
npm test
npm run test:rules
bash scripts/deploy-operation-receipts-ttl.sh --apply
bash scripts/deploy-rules.sh
bash scripts/deploy-functions.sh main --only setTournamentPresence
bash scripts/deploy-functions.sh autodraw --only applyMatchResult,applyQueuedResult,assignMatchCourt,setTournamentPresenceWithWOSubstitution
bash scripts/deploy-operation-receipts-ttl.sh --check
echo '✓ Gate B1 publicado; cliente ainda sem roteamento regional automático'

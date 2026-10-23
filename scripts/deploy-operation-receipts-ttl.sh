#!/usr/bin/env bash
# Ativa/confere os TTLs operacionais explícitos no Firestore.
# Uso: --dry-run (sem credenciais), --apply (muda a política), --check (somente leitura).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT=scoreplace-app
FIELD=expireAt
GROUPS=(operationReceipts operationControl)
MODE="${1:-}"
[[ "$MODE" == --dry-run || "$MODE" == --apply || "$MODE" == --check ]] && [ "$#" -eq 1 ] || {
  echo 'uso: deploy-operation-receipts-ttl.sh [--dry-run|--apply|--check]' >&2
  exit 2
}

# O manifesto precisa concordar com este deploy direcionado.
node - "$ROOT/firestore.indexes.json" "$FIELD" "${GROUPS[@]}" <<'NODE'
const fs = require('node:fs');
const [manifest, field, ...groups] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(manifest, 'utf8'));
for (const group of groups) {
  const entry = (config.fieldOverrides || []).find(x => x.collectionGroup === group && x.fieldPath === field);
  if (!entry || entry.ttl !== true || !Array.isArray(entry.indexes) || entry.indexes.length) {
    console.error('manifesto não declara TTL direcionado sem índices para ' + group + '.' + field);
    process.exit(1);
  }
}
NODE

if [ "$MODE" == --dry-run ]; then
  for GROUP in "${GROUPS[@]}"; do
    echo "gcloud firestore fields ttls update $FIELD --collection-group=$GROUP --enable-ttl --project=$PROJECT"
    echo "gcloud firestore fields ttls list --collection-group=$GROUP --project=$PROJECT --format=json"
  done
  exit 0
fi

KEY="${GOOGLE_APPLICATION_CREDENTIALS:-${HOME}/.config/scoreplace/deploy-sa.json}"
[ -r "$KEY" ] || { echo 'conta de serviço indisponível; TTL não alterado' >&2; exit 1; }
export CLOUDSDK_CONFIG
CLOUDSDK_CONFIG="$(mktemp -d)"
trap 'rm -rf "$CLOUDSDK_CONFIG"' EXIT
gcloud auth activate-service-account --key-file="$KEY" --project="$PROJECT" --quiet >/dev/null

for GROUP in "${GROUPS[@]}"; do
  if [ "$MODE" == --apply ]; then
    gcloud firestore fields ttls update "$FIELD" --collection-group="$GROUP" \
      --enable-ttl --project="$PROJECT" --quiet
  fi
  TTL_JSON="$(gcloud firestore fields ttls list --collection-group="$GROUP" \
    --project="$PROJECT" --format=json)"
  TTL_JSON="$TTL_JSON" node - "$GROUP" "$FIELD" <<'NODE'
const [group, field] = process.argv.slice(2);
const fields = JSON.parse(process.env.TTL_JSON);
const wanted = fields.find(x => typeof x.name === 'string' &&
  x.name.endsWith('/collectionGroups/' + group + '/fields/' + field));
if (!wanted) {
  console.error('TTL não encontrado para ' + group + '.' + field);
  process.exit(1);
}
const state = wanted.ttlConfig && wanted.ttlConfig.state;
if (state !== 'ACTIVE') {
  console.error('TTL presente, mas ainda não ativo: ' + (state || 'estado desconhecido'));
  process.exit(1);
}
console.log('TTL ativo: ' + group + '.' + field);
NODE
done

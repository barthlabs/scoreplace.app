#!/usr/bin/env bash
# Publica e verifica seis portas operacionais, sem alterar as URLs do cliente.
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:---check-v2}"
[[ "$mode" == '--deploy-v2' || "$mode" == '--check-v2' || "$mode" == '--refresh-v2' ]] || exit 2
project=scoreplace-app
regions=(us-east1 us-east4 us-south1)
names=(sp-op-court-v2 sp-op-score-v2 sp-op-presence-v2 sp-op-presence-wo-v2 sp-op-end-court-v2 sp-op-control-v2)
targets=(assignMatchCourt applyMatchResult setTournamentPresence setTournamentPresenceWithWOSubstitution endMatchOnCourt tournamentOperationControl)
codebases=(functions-autodraw functions-autodraw functions functions-autodraw functions-autodraw functions-autodraw)
manifest=.claude/tmp/operation-regions-manifest-v2.json
mkdir -p .claude/tmp

describe() { gcloud run services describe "$1" --project "$project" --region "$2" --format=json 2>/dev/null; }
field() { node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{let x=JSON.parse(s);for(const p of process.argv[1].split("."))x=x?.[p];process.stdout.write(x==null?"":String(x))})' "$1"; }
check_tree() {
  [[ -z "$(git status --porcelain)" ]] || { echo 'árvore suja' >&2; exit 1; }
  node scripts/check-vendor-fresh.js
}
record() {
  local json="$1" name="$2" region="$3" target="$4" codebase="$5" commit="$6" digest="$7"
  SP_ROW="$(SP_JSON="$json" node -e 'const s=JSON.parse(process.env.SP_JSON); const e=Object.fromEntries((s.spec?.template?.spec?.containers?.[0]?.env||[]).map(v=>[v.name,v.value]));process.stdout.write(JSON.stringify({name:process.argv[1],region:process.argv[2],target:process.argv[3],codebase:process.argv[4],commit:process.argv[5],sourceDigest:process.argv[6],image:s.spec?.template?.spec?.containers?.[0]?.image,url:s.status?.url,revision:s.status?.latestReadyRevisionName,env:e}))' "$name" "$region" "$target" "$codebase" "$commit" "$digest")" \
  SP_MANIFEST="$manifest" node - <<'NODE'
const fs=require('fs');const p=process.env.SP_MANIFEST,row=JSON.parse(process.env.SP_ROW);
if(!row.image?.includes('@sha256:')||!row.url||!row.revision||row.env.SP_SOURCE_DIGEST!==row.sourceDigest||row.env.SP_OPERATION_REGION!==row.region) process.exit(1);
const rows=fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):[];
const i=rows.findIndex(x=>x.name===row.name&&x.region===row.region);
if(i>=0)rows[i]=row;else rows.push(row);
delete row.env;fs.writeFileSync(p,JSON.stringify(rows,null,2)+'\n');
NODE
}
probe_no_auth() {
  local body code
  body="$(mktemp)"
  code="$(curl -sS --max-time 15 -o "$body" -w '%{http_code}' -H 'content-type: application/json' -d '{"data":{"probe":true}}' "$1")"
  [[ "$code" == 401 || "$code" == 403 ]] || { echo "auth inesperada HTTP $code: $1" >&2; rm -f "$body"; exit 1; }
  node - "$body" <<'NODE'
const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[2]));
if(!['UNAUTHENTICATED','unauthenticated'].includes(x.error?.status))process.exit(1);
NODE
  rm -f "$body"
}

if [[ "$mode" == '--refresh-v2' ]]; then
  check_tree
  [[ -s "$manifest" ]] || { echo 'manifesto anterior ausente' >&2; exit 1; }
  previous_manifest="$manifest"
  previous_commit="$(SP_MANIFEST="$manifest" node -e 'const m=require("./"+process.env.SP_MANIFEST);const a=[...new Set(m.map(x=>x.commit))];if(m.length!==18||a.length!==1)process.exit(1);process.stdout.write(a[0])')"
  backend_diff="$(git diff --name-only "$previous_commit" HEAD -- functions functions-autodraw)"
  [[ "$backend_diff" == $'functions-autodraw/index.js\nfunctions-autodraw/vendor/tournaments.js' ]] || {
    echo "diferença do backend fora do corte aprovado: $backend_diff" >&2; exit 1;
  }
  # Preserve o manifesto até que todas as 18 novas revisões estejam verificadas.
  for i in "${!names[@]}"; do
    name="${names[$i]}" target="${targets[$i]}" codebase="${codebases[$i]}"
    # O digest antigo é registrado no manifesto; valide a revisão publicada,
    # não recalcule com arquivos locais que já foram alterados.
    for region in "${regions[@]}"; do
      json="$(describe "$name" "$region")" || { echo "serviço antigo ausente: $name/$region" >&2; exit 1; }
      SP_MANIFEST="$previous_manifest" SP_JSON="$json" SP_NAME="$name" SP_REGION="$region" SP_TARGET="$target" SP_CODEBASE="$codebase" node - <<'NODE'
const fs=require('fs'), rows=JSON.parse(fs.readFileSync(process.env.SP_MANIFEST));
const r=rows.find(x=>x.name===process.env.SP_NAME&&x.region===process.env.SP_REGION);
const s=JSON.parse(process.env.SP_JSON), e=Object.fromEntries((s.spec?.template?.spec?.containers?.[0]?.env||[]).map(x=>[x.name,x.value]));
if(!r||r.target!==process.env.SP_TARGET||r.codebase!==process.env.SP_CODEBASE||
  r.image!==s.spec?.template?.spec?.containers?.[0]?.image||r.revision!==s.status?.latestReadyRevisionName||
  r.url!==s.status?.url||e.SP_SOURCE_DIGEST!==r.sourceDigest||e.SP_OPERATION_REGION!==r.region||
  s.spec?.template?.metadata?.annotations?.['run.googleapis.com/base-images'])process.exit(1);
NODE
      probe_no_auth "$(printf '%s' "$json" | field status.url)"
    done
  done
  commit="$(git rev-parse HEAD)"
  [[ "$commit" != "$previous_commit" ]] || { echo 'nenhuma revisão de fonte a atualizar' >&2; exit 1; }
  next_manifest="$(mktemp .claude/tmp/operation-regions-manifest-v2.next.XXXXXX)"
  trap 'rm -f "$next_manifest"' EXIT
  printf '[]\n' > "$next_manifest"
  manifest="$next_manifest"
  for i in "${!names[@]}"; do
    name="${names[$i]}" target="${targets[$i]}" codebase="${codebases[$i]}"
    digest="$(node scripts/operation-source-digest.js "$codebase" "$target" "$commit")"
    runtime="$(node -p "require('./$codebase/package.json').engines.node")"
    gcloud run deploy "$name" --project "$project" --region us-east1 --source "$codebase" \
      --function "$target" --base-image "nodejs$runtime" --no-automatic-updates \
      --set-env-vars "SP_SOURCE_DIGEST=$digest,SP_OPERATION_REGION=us-east1" --allow-unauthenticated --quiet
    source_json="$(describe "$name" us-east1)"
    record "$source_json" "$name" us-east1 "$target" "$codebase" "$commit" "$digest"
    image="$(printf '%s' "$source_json" | field spec.template.spec.containers.0.image)"
    for region in "${regions[@]:1}"; do
      gcloud run deploy "$name" --project "$project" --region "$region" --image "$image" \
        --set-env-vars "SP_SOURCE_DIGEST=$digest,SP_OPERATION_REGION=$region" --allow-unauthenticated --quiet
      record "$(describe "$name" "$region")" "$name" "$region" "$target" "$codebase" "$commit" "$digest"
    done
  done
  manifest="$next_manifest"
fi

if [[ "$mode" == '--deploy-v2' ]]; then
  check_tree
  branch="$(git branch --show-current)"
  [[ "$branch" == 'codex/regional-failover-b2' ]] || { echo 'branch B2 obrigatória' >&2; exit 1; }
  commit="$(git rev-parse HEAD)"
  [[ "$commit" == "$(git rev-parse origin/codex/regional-failover-b2)" ]] || { echo 'branch remota divergente' >&2; exit 1; }
  # Um deploy --source sobrescreveria silenciosamente um serviço homônimo.
  # Verifique todos os nomes antes do primeiro build para preservar o v1.
  existing_functions="$(gcloud functions list --project "$project" --format='value(name)')"
  for region in "${regions[@]}"; do
    for name in "${names[@]}"; do
      if describe "$name" "$region" >/dev/null; then
        echo "serviço v2 já existe: $name/$region" >&2; exit 1
      fi
      if printf '%s\n' "$existing_functions" | grep -Eq "(^|/)$name$"; then
        echo "Firebase Function homônima: $name" >&2; exit 1
      fi
    done
  done
  for i in "${!names[@]}"; do
    name="${names[$i]}" target="${targets[$i]}" codebase="${codebases[$i]}"
    digest="$(node scripts/operation-source-digest.js "$codebase" "$target" "$commit")"
    runtime="$(node -p "require('./$codebase/package.json').engines.node")"
    gcloud run deploy "$name" --project "$project" --region us-east1 --source "$codebase" \
      --function "$target" --base-image "nodejs$runtime" --no-automatic-updates \
      --set-env-vars "SP_SOURCE_DIGEST=$digest,SP_OPERATION_REGION=us-east1" --allow-unauthenticated --quiet
    source_json="$(describe "$name" us-east1)"
    record "$source_json" "$name" us-east1 "$target" "$codebase" "$commit" "$digest"
    image="$(printf '%s' "$source_json" | field spec.template.spec.containers.0.image)"
    for region in "${regions[@]:1}"; do
      gcloud run deploy "$name" --project "$project" --region "$region" --image "$image" \
        --set-env-vars "SP_SOURCE_DIGEST=$digest,SP_OPERATION_REGION=$region" --allow-unauthenticated --quiet
      record "$(describe "$name" "$region")" "$name" "$region" "$target" "$codebase" "$commit" "$digest"
    done
  done
fi

check_tree
[[ -f "$manifest" ]] || { echo 'manifesto v2 ausente' >&2; exit 1; }
source_commit="$(SP_MANIFEST="$manifest" node -e 'const m=require("./"+process.env.SP_MANIFEST);const a=[...new Set(m.map(x=>x.commit))];if(a.length!==1)process.exit(1);process.stdout.write(a[0])')"
git diff --quiet "$source_commit" HEAD -- functions functions-autodraw || { echo 'codebase mudou após build' >&2; exit 1; }
for i in "${!names[@]}"; do
  name="${names[$i]}" target="${targets[$i]}" codebase="${codebases[$i]}"
  digest="$(node scripts/operation-source-digest.js "$codebase" "$target" "$source_commit")"
  source_image=''
  for region in "${regions[@]}"; do
    json="$(describe "$name" "$region")" || { echo "serviço ausente: $name/$region" >&2; exit 1; }
    SP_MANIFEST="$manifest" SP_JSON="$json" SP_NAME="$name" SP_REGION="$region" SP_DIGEST="$digest" node - <<'NODE'
const fs=require('fs');const rows=JSON.parse(fs.readFileSync(process.env.SP_MANIFEST));
const r=rows.find(x=>x.name===process.env.SP_NAME&&x.region===process.env.SP_REGION);
const s=JSON.parse(process.env.SP_JSON),env=Object.fromEntries((s.spec?.template?.spec?.containers?.[0]?.env||[]).map(x=>[x.name,x.value]));
if(!r||r.sourceDigest!==process.env.SP_DIGEST||env.SP_SOURCE_DIGEST!==r.sourceDigest||env.SP_OPERATION_REGION!==r.region||
  s.status?.latestReadyRevisionName!==r.revision||s.status?.url!==r.url||s.spec?.template?.spec?.containers?.[0]?.image!==r.image||
  s.spec?.template?.metadata?.annotations?.['run.googleapis.com/base-images'])process.exit(1);
NODE
    image="$(printf '%s' "$json" | field spec.template.spec.containers.0.image)"
    if [[ -n "$source_image" && "$image" != "$source_image" ]]; then echo "imagem divergente: $name/$region" >&2; exit 1; fi
    source_image="$image"
    probe_no_auth "$(printf '%s' "$json" | field status.url)"
    echo "✓ $name/$region"
  done
done
if [[ "$mode" == '--refresh-v2' ]]; then
  mv "$next_manifest" "$previous_manifest"
  trap - EXIT
  echo "✓ manifesto substituído após validar 18 revisões: $previous_manifest"
fi

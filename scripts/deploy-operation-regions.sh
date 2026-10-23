#!/usr/bin/env bash
# Deploy de serviços NOVOS e inativos. Não muda URLs usadas pelo app.
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:---check}"
if [[ "$mode" == '--deploy-v3' || "$mode" == '--resume-v3' || "$mode" == '--retarget-v3' || "$mode" == '--check-v3' || "$mode" == '--check-v2-live' ]]; then
  exec "$(dirname "$0")/deploy-operation-regions-v3.sh" "$mode"
fi
if [[ "$mode" == '--deploy-v2' || "$mode" == '--check-v2' || "$mode" == '--refresh-v2' || "$mode" == '--recover-v2' ]]; then
  exec "$(dirname "$0")/deploy-operation-regions-v2.sh" "$mode"
fi
if [[ "$mode" == '--deploy-legacy-gate' || "$mode" == '--check-legacy-gate' || "$mode" == '--check-legacy-gate-live' ]]; then
  gate_mode=--check
  [[ "$mode" == '--deploy-legacy-gate' ]] && gate_mode=--deploy
  [[ "$mode" == '--check-legacy-gate-live' ]] && gate_mode=--check-live
  exec "$(dirname "$0")/deploy-operation-legacy-gate-v2.sh" "$gate_mode"
fi
if [[ "$mode" != '--check' && "$mode" != '--deploy' && "$mode" != '--resume-first' ]]; then
  echo 'uso: scripts/deploy-operation-regions.sh [--check|--deploy|--resume-first]' >&2; exit 2
fi
project=scoreplace-app
regions=(us-east1 us-east4 us-south1 us-west1 southamerica-east1)
names=(sp-op-court-v1 sp-op-score-v1 sp-op-presence-v1 sp-op-presence-wo-v1)
targets=(assignMatchCourt applyMatchResult setTournamentPresence setTournamentPresenceWithWOSubstitution)
codebases=(functions-autodraw functions-autodraw functions functions-autodraw)
manifest=.claude/tmp/operation-regions-manifest.json
mkdir -p .claude/tmp

describe() {
  gcloud run services describe "$1" --project "$project" --region "$2" --format=json 2>/dev/null
}
exists() { describe "$1" "$2" >/dev/null; }
field() {
  node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const x=JSON.parse(s);const path=process.argv[1].split(".");let y=x;for(const p of path)y=y?.[p];process.stdout.write(y == null ? "" : String(y))})' "$1"
}
base_annotation() {
  node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>process.stdout.write(JSON.parse(s).spec?.template?.metadata?.annotations?.["run.googleapis.com/base-images"]||""))'
}
digest_for() { node scripts/operation-source-digest.js "$1" "$2" "$3"; }
record() {
  local name="$1" region="$2" target="$3" codebase="$4" commit="$5" source_digest="$6"
  local json image url revision
  json="$(describe "$name" "$region")"
  image="$(printf '%s' "$json" | field spec.template.spec.containers.0.image)"
  url="$(printf '%s' "$json" | field status.url)"
  revision="$(printf '%s' "$json" | field status.latestReadyRevisionName)"
  [[ "$image" == *@sha256:* && -n "$url" && -n "$revision" ]] || { echo "revisão incompleta: $name/$region" >&2; exit 1; }
  SP_MANIFEST="$manifest" SP_RECORD="$(node -e 'process.stdout.write(JSON.stringify({name:process.argv[1],region:process.argv[2],target:process.argv[3],codebase:process.argv[4],commit:process.argv[5],sourceDigest:process.argv[6],image:process.argv[7],url:process.argv[8],revision:process.argv[9]}))' "$name" "$region" "$target" "$codebase" "$commit" "$source_digest" "$image" "$url" "$revision")" node - <<'NODE'
const fs=require('fs');const p=process.env.SP_MANIFEST;const r=JSON.parse(process.env.SP_RECORD);
const rows=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):[];
const i=rows.findIndex(x=>x.name===r.name&&x.region===r.region);
if(i>=0) rows[i]=r; else rows.push(r);
fs.writeFileSync(p,JSON.stringify(rows,null,2)+'\n');
NODE
}

if [[ "$mode" == '--check' ]]; then
  [[ -f "$manifest" ]] || { echo "manifesto ausente: $manifest" >&2; exit 1; }
  for region in "${regions[@]}"; do
    for i in "${!names[@]}"; do
      name="${names[$i]}"; target="${targets[$i]}"; codebase="${codebases[$i]}"
      json="$(describe "$name" "$region")" || { echo "ausente: $name/$region" >&2; exit 1; }
      SP_MANIFEST="$manifest" SP_NAME="$name" SP_REGION="$region" SP_SERVICE_JSON="$json" node - <<'NODE'
const fs=require('fs');const m=JSON.parse(fs.readFileSync(process.env.SP_MANIFEST));
const row=m.find(x=>x.name===process.env.SP_NAME&&x.region===process.env.SP_REGION);
const s=JSON.parse(process.env.SP_SERVICE_JSON);
if(!row||row.url!==s.status?.url||row.revision!==s.status?.latestReadyRevisionName||row.image!==s.spec?.template?.spec?.containers?.[0]?.image)process.exit(1);
const env=Object.fromEntries((s.spec?.template?.spec?.containers?.[0]?.env||[]).map(x=>[x.name,x.value]));
if(env.SP_SOURCE_DIGEST!==row.sourceDigest||env.SP_OPERATION_REGION!==row.region)process.exit(2);
if(s.spec?.template?.metadata?.annotations?.['run.googleapis.com/base-images']) process.exit(3);
const source=m.find(x=>x.name===row.name&&x.region==='us-east1');
if(!source||source.image!==row.image) process.exit(4);
NODE
      echo "✓ $name/$region"
    done
  done
  exit 0
fi

[[ -z "$(git status --porcelain)" ]] || { echo 'árvore suja; faça commit e passe o gate de revisão antes do deploy' >&2; exit 1; }
commit="$(git rev-parse HEAD)"
[[ "$(git branch --show-current)" == main ]] || { echo 'deploy exige main' >&2; exit 1; }
[[ "$commit" == "$(git rev-parse origin/main)" ]] || { echo 'main local e remoto divergentes' >&2; exit 1; }
functions="$(gcloud functions list --project "$project" --format='value(name)')"
if [[ "$mode" == '--resume-first' ]]; then
  [[ -f "$manifest" ]] || { echo 'manifesto da tentativa inicial ausente' >&2; exit 1; }
  if grep -rEq 'sp-op-(court|score|presence)-v1' js; then
    echo 'serviço novo apareceu no cliente; retomada proibida' >&2; exit 1
  fi
  SP_MANIFEST="$manifest" node - <<'NODE'
const fs=require('fs');const rows=JSON.parse(fs.readFileSync(process.env.SP_MANIFEST));
if(rows.length!==1||rows[0].name!=='sp-op-court-v1'||rows[0].region!=='us-east1'||
   rows[0].target!=='assignMatchCourt'||rows[0].codebase!=='functions-autodraw'||
   !rows[0].commit.startsWith('b80bf2b68')) process.exit(1);
NODE
fi
for region in "${regions[@]}"; do
  for name in "${names[@]}"; do
    if exists "$name" "$region"; then
      if [[ "$mode" != '--resume-first' || "$name" != sp-op-court-v1 ||
            ( "$region" != us-east1 && "$region" != us-east4 ) ]]; then
        echo "serviço já existe: $name/$region" >&2; exit 1
      fi
      SP_SERVICE_JSON="$(describe "$name" "$region")" SP_REGION="$region" SP_MANIFEST="$manifest" node - <<'NODE'
const fs=require('fs');const s=JSON.parse(process.env.SP_SERVICE_JSON);
const row=JSON.parse(fs.readFileSync(process.env.SP_MANIFEST))[0];
const env=Object.fromEntries((s.spec?.template?.spec?.containers?.[0]?.env||[]).map(x=>[x.name,x.value]));
if(s.metadata?.name!=='sp-op-court-v1'||env.SP_SOURCE_DIGEST!==row.sourceDigest||
   env.SP_OPERATION_REGION!==process.env.SP_REGION||
   (process.env.SP_REGION==='us-east1' &&
    (s.status?.latestReadyRevisionName!==row.revision||s.status?.url!==row.url||
     s.metadata?.annotations?.['run.googleapis.com/build-function-target']!=='assignMatchCourt'))||
   (process.env.SP_REGION==='us-east4' && s.status?.latestReadyRevisionName)) process.exit(1);
NODE
    fi
    if printf '%s\n' "$functions" | grep -Eq "(^|/)$name$"; then echo "Firebase Function homônima: $name" >&2; exit 1; fi
  done
done

# Primeiro build isolado, depois os outros três. Nenhum serviço existente é sobrescrito.
for i in "${!names[@]}"; do
  name="${names[$i]}"; target="${targets[$i]}"; codebase="${codebases[$i]}"
  runtime="$(node -p "require('./$codebase/package.json').engines.node")"
  digest="$(digest_for "$codebase" "$target" "$commit")"
  gcloud run deploy "$name" --project "$project" --region us-east1 \
    --source "$codebase" --function "$target" --base-image "nodejs$runtime" --no-automatic-updates \
    --set-env-vars "SP_SOURCE_DIGEST=$digest,SP_OPERATION_REGION=us-east1" \
    --allow-unauthenticated --quiet
  record "$name" us-east1 "$target" "$codebase" "$commit" "$digest"
  json="$(describe "$name" us-east1)"
  if [[ -n "$(printf '%s' "$json" | base_annotation)" ]]; then
    echo "imagem de fonte ainda usa base automática: $name" >&2; exit 1
  fi
  url="$(describe "$name" us-east1 | field status.url)"
  status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -H 'content-type: application/json' -d '{"data":{"probe":true}}' "$url")"
  [[ "$status" == 401 || "$status" == 403 ]] || { echo "sonda sem token inesperada: $name HTTP $status" >&2; exit 1; }
  echo "✓ primeiro build e auth: $name ($status)"
  image="$(describe "$name" us-east1 | field spec.template.spec.containers.0.image)"
  gcloud artifacts docker images describe "$image" --project "$project" --quiet >/dev/null
  for region in "${regions[@]:1}"; do
    clear_base=false
    if exists "$name" "$region"; then
      json="$(describe "$name" "$region")"
      SP_SERVICE_JSON="$json" node - <<'NODE'
const s=JSON.parse(process.env.SP_SERVICE_JSON);
if(s.metadata?.name!=='sp-op-court-v1'||s.status?.latestReadyRevisionName)process.exit(1);
NODE
      if [[ -n "$(printf '%s' "$json" | base_annotation)" ]]; then
        clear_base=true
      fi
    fi
    if [[ "$clear_base" == true ]]; then
      gcloud run deploy "$name" --project "$project" --region "$region" --image "$image" --clear-base-image \
        --set-env-vars "SP_SOURCE_DIGEST=$digest,SP_OPERATION_REGION=$region" \
        --allow-unauthenticated --quiet
    else
      gcloud run deploy "$name" --project "$project" --region "$region" --image "$image" \
        --set-env-vars "SP_SOURCE_DIGEST=$digest,SP_OPERATION_REGION=$region" \
        --allow-unauthenticated --quiet
    fi
    record "$name" "$region" "$target" "$codebase" "$commit" "$digest"
    url="$(describe "$name" "$region" | field status.url)"
    status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -H 'content-type: application/json' -d '{"data":{"probe":true}}' "$url")"
    [[ "$status" == 401 || "$status" == 403 ]] || { echo "sonda sem token inesperada: $name/$region HTTP $status" >&2; exit 1; }
    echo "✓ $name/$region ($status)"
  done
done
"$0" --check

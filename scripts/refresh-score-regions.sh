#!/usr/bin/env bash
# Atualiza somente applyMatchResult nas oito portas já usadas pelo cliente.
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:---preflight}"
[[ "$mode" == --preflight || "$mode" == --stage || "$mode" == --deploy ]] || exit 2
[[ -z "$(git status --porcelain)" ]] || { echo 'árvore suja' >&2; exit 1; }
node scripts/check-vendor-fresh.js
source_commit="$(git log -1 --format=%H -- functions-autodraw)"
[[ "$source_commit" =~ ^[a-f0-9]{40}$ ]] || exit 1
# O código-fonte e o vendor devem guardar o próprio gerador de 3º lugar.
# Uma ocorrência solta de `_isEliminationBracket` não comprova essa proteção.
for logic in js/views/bracket-logic.js functions-autodraw/vendor/bracket-logic.js; do
  rg -U -q 'function _maybeGenerate3rdPlace\(t\) \{(?:[^\n]*\n){0,12}  if \(!_isEliminationBracket\(t\)\)' "$logic" || {
    echo "trava classificatória ausente em $logic" >&2; exit 1;
  }
done
for version in v2 v3; do
  node scripts/check-operation-regions-mixed.js "$version" --allow-legacy-court
done
resume_started="$(SP_COMMIT="$source_commit" node - <<'NODE'
const fs = require('fs');
const started = ['v2', 'v3'].some(version => {
  const rows = JSON.parse(fs.readFileSync(`.claude/tmp/operation-regions-manifest-${version}.json`));
  return rows.some(row => row.name === `sp-op-score-${version}` && row.commit === process.env.SP_COMMIT);
});
process.stdout.write(started ? '1' : '0');
NODE
)"
if [[ "$mode" == --preflight ]]; then
  if [[ "$resume_started" == 0 ]]; then
    node scripts/generate-operation-regions-config.js --check
    node scripts/generate-operation-regions-v3-config.js --check
  else
    echo '✓ retomada parcial: a configuração pública será regenerada após completar as oito portas'
  fi
fi
if [[ "$mode" != --preflight && ! -e .claude/tmp/operation-regions-manifest-v2.score-candidate.json &&
      ! -e .claude/tmp/operation-regions-manifest-v3.score-candidate.json && "$resume_started" == 0 ]]; then
  # Confronta as oito portas antes da primeira mudança. Numa retomada, cada
  # porta já atualizada é verificada contra o candidato salvo no loop abaixo.
  bash "$0" --preflight
fi

project=scoreplace-app
describe() { gcloud run services describe "$1" --project "$project" --region "$2" --format=json; }
revision() { gcloud run revisions describe "$1" --project "$project" --region "$2" --format=json; }
field() { node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{let x=JSON.parse(s);for(const p of process.argv[1].split("."))x=x?.[p];process.stdout.write(x==null?"":String(x))})' "$1"; }
served_name() {
  SP_SERVICE_JSON="$1" node -e 'const x=require("./scripts/check-served-operation-revision");process.stdout.write(x.servedRevisionName(JSON.parse(process.env.SP_SERVICE_JSON)))'
}
probe() {
  local file code
  file="$(mktemp)"
  code="$(curl -sS --max-time 20 -o "$file" -w '%{http_code}' -H 'content-type: application/json' -d '{"data":{"probe":true}}' "$1")"
  [[ "$code" == 401 || "$code" == 403 ]] || { rm -f "$file"; echo "sonda HTTP $code" >&2; exit 1; }
  node - "$file" <<'NODE'
const x=JSON.parse(require('fs').readFileSync(process.argv[2]));
if(!['UNAUTHENTICATED','unauthenticated'].includes(x.error?.status))process.exit(1);
NODE
  rm -f "$file"
}
check_service() {
  local json="$1" file="$2" name="$3" region="$4"
  local served rev_json
  served="$(served_name "$json")"
  rev_json="$(revision "$served" "$region")"
  SP_SERVICE_JSON="$json" SP_REVISION_JSON="$rev_json" SP_FILE="$file" SP_NAME="$name" SP_REGION="$region" node scripts/check-served-operation-revision.js >/dev/null
  probe "$(printf '%s' "$json" | field status.url)"
}
check_old() {
  local json="$1" name="$2" region="$3" served rev_json baseline
  baseline="${SP_SCORE_BASELINE_FILE:-.claude/tmp/operation-regions-manifest-${name##*-}.json}"
  served="$(served_name "$json")"
  rev_json="$(revision "$served" "$region")"
  SP_SERVICE_JSON="$json" SP_REVISION_JSON="$rev_json" SP_FILE="$baseline" \
    SP_NAME="$name" SP_REGION="$region" node - <<'NODE'
const fs=require('fs');
const {checkServed}=require('./scripts/check-served-operation-revision');
const s=JSON.parse(process.env.SP_SERVICE_JSON),r=JSON.parse(process.env.SP_REVISION_JSON);
const rows=JSON.parse(fs.readFileSync(process.env.SP_FILE)).filter(x=>x.name===process.env.SP_NAME&&x.region===process.env.SP_REGION);
if(rows.length!==1)throw Error('linha anterior ausente ou duplicada');
checkServed(s,r,rows[0]);
NODE
  probe "$(printf '%s' "$json" | field status.url)"
}
candidate_action() {
  SP_SERVICE_JSON="$1" SP_REVISION_JSON="$2" SP_PREVIOUS="$3" SP_REGION="$4" \
    SP_DIGEST="$5" SP_IMAGE="$6" node - <<'NODE'
const {candidateDecision}=require('./scripts/check-served-operation-revision');
const s=JSON.parse(process.env.SP_SERVICE_JSON),r=JSON.parse(process.env.SP_REVISION_JSON);
const result=candidateDecision(s,r,{previousRevision:process.env.SP_PREVIOUS,
  sourceDigest:process.env.SP_DIGEST,region:process.env.SP_REGION,
  ...(process.env.SP_IMAGE?{image:process.env.SP_IMAGE}:{})});
process.stdout.write(result.action);
NODE
}
check_promoted() {
  local json="$1" rev_json="$2" name="$3" region="$4" digest="$5" expected="$6"
  SP_JSON="$json" SP_REV_JSON="$rev_json" SP_NAME="$name" SP_REGION="$region" \
    SP_DIGEST="$digest" SP_EXPECTED="$expected" node - <<'NODE'
const {checkServed}=require('./scripts/check-served-operation-revision');
const s=JSON.parse(process.env.SP_JSON),r=JSON.parse(process.env.SP_REV_JSON);
if(s.status?.latestReadyRevisionName!==process.env.SP_EXPECTED)throw Error('revisão nova não está pronta');
checkServed(s,r,{revision:process.env.SP_EXPECTED,region:process.env.SP_REGION,
  image:r.spec?.containers?.[0]?.image,sourceDigest:process.env.SP_DIGEST,url:s.status.url});
NODE
  probe "$(printf '%s' "$json" | field status.url)"
}
rollback_traffic() {
  local name="$1" region="$2" previous="$3" current
  echo "✗ promoção sem confirmação: revertendo $name/$region" >&2
  if ! gcloud run services update-traffic "$name" --project "$project" --region "$region" \
      --to-revisions "$previous=100" --quiet >/dev/null; then
    echo "✗ REVERSÃO NÃO CONFIRMADA $name/$region" >&2; exit 78
  fi
  current="$(describe "$name" "$region")" || { echo "✗ REVERSÃO NÃO CONFIRMADA $name/$region" >&2; exit 78; }
  check_old "$current" "$name" "$region" || { echo "✗ REVERSÃO NÃO CONFIRMADA $name/$region" >&2; exit 78; }
  echo "✓ tráfego antigo restaurado $name/$region" >&2
  exit 1
}
record() {
  local json="$1" rev_json="$2" file="$3" name="$4" region="$5" digest="$6"
  SP_JSON="$json" SP_REV_JSON="$rev_json" SP_FILE="$file" SP_NAME="$name" SP_REGION="$region" SP_DIGEST="$digest" SP_COMMIT="$source_commit" node - <<'NODE'
const fs=require('fs'),m=JSON.parse(fs.readFileSync(process.env.SP_FILE));
const {checkServed,servedRevisionName}=require('./scripts/check-served-operation-revision');
const s=JSON.parse(process.env.SP_JSON),r=JSON.parse(process.env.SP_REV_JSON);
const i=m.findIndex(x=>x.name===process.env.SP_NAME&&x.region===process.env.SP_REGION);
const old=m[i];
if(i<0||!s.status?.url||s.status.url!==old.url)process.exit(1);
const rev=servedRevisionName(s),image=r.spec?.containers?.[0]?.image;
const e=Object.fromEntries((r.spec?.containers?.[0]?.env||[]).map(x=>[x.name,x.value]));
checkServed(s,r,{revision:rev,region:process.env.SP_REGION,image,sourceDigest:process.env.SP_DIGEST,url:s.status.url});
m[i]={name:process.env.SP_NAME,region:process.env.SP_REGION,target:'applyMatchResult',codebase:'functions-autodraw',
  commit:process.env.SP_COMMIT,sourceDigest:process.env.SP_DIGEST,
  image,url:s.status.url,revision:rev,env:e};
fs.writeFileSync(process.env.SP_FILE,JSON.stringify(m,null,2)+'\n');
NODE
}
record_stage() {
  local json="$1" rev_json="$2" file="$3" name="$4" region="$5" digest="$6" next="$7"
  SP_JSON="$json" SP_REV_JSON="$rev_json" SP_FILE="$file" SP_NAME="$name" \
    SP_REGION="$region" SP_DIGEST="$digest" SP_COMMIT="$source_commit" SP_NEXT="$next" node - <<'NODE'
const fs=require('fs'),m=JSON.parse(fs.readFileSync(process.env.SP_FILE));
const s=JSON.parse(process.env.SP_JSON),r=JSON.parse(process.env.SP_REV_JSON);
const i=m.findIndex(x=>x.name===process.env.SP_NAME&&x.region===process.env.SP_REGION);
if(i<0||!s.status?.url||r.metadata?.name!==process.env.SP_NEXT||
  s.status?.latestReadyRevisionName!==process.env.SP_NEXT)process.exit(1);
const image=r.spec?.containers?.[0]?.image;
const env=Object.fromEntries((r.spec?.containers?.[0]?.env||[]).map(x=>[x.name,x.value]));
if(!image||env.SP_SOURCE_DIGEST!==process.env.SP_DIGEST||env.SP_OPERATION_REGION!==process.env.SP_REGION)process.exit(1);
m[i]={name:process.env.SP_NAME,region:process.env.SP_REGION,target:'applyMatchResult',codebase:'functions-autodraw',
  commit:process.env.SP_COMMIT,sourceDigest:process.env.SP_DIGEST,image,
  url:s.status.url,revision:process.env.SP_NEXT,env};
fs.writeFileSync(process.env.SP_FILE,JSON.stringify(m,null,2)+'\n');
NODE
}

for version in v3 v2; do
  name="sp-op-score-$version"
  manifest=".claude/tmp/operation-regions-manifest-$version.json"
  candidate=".claude/tmp/operation-regions-manifest-$version.score-candidate.json"
  if [[ "$version" == v3 ]]; then
    regions=(us-east1 us-east4 us-south1 us-central1 southamerica-east1)
  else
    regions=(us-east1 us-east4 us-south1)
  fi
  digest="$(node scripts/operation-source-digest.js functions-autodraw applyMatchResult "$source_commit")"
  if [[ "$mode" != --preflight && ! -e "$candidate" ]]; then cp "$manifest" "$candidate"; fi
  source_image=''
  no_traffic=()
  if [[ "$mode" == --stage ]]; then no_traffic=(--no-traffic); fi
  for region in "${regions[@]}"; do
    json="$(describe "$name" "$region")"
    previous="$(SP_FILE="$manifest" SP_NAME="$name" SP_REGION="$region" node -e 'const x=JSON.parse(require("fs").readFileSync(process.env.SP_FILE));const r=x.find(v=>v.name===process.env.SP_NAME&&v.region===process.env.SP_REGION);if(!r)process.exit(1);process.stdout.write(r.revision)')"
    current_digest="$(printf '%s' "$json" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const x=JSON.parse(s);process.stdout.write((x.spec?.template?.spec?.containers?.[0]?.env||[]).find(e=>e.name==="SP_SOURCE_DIGEST")?.value||"")})')"
    if [[ "$current_digest" == "$digest" && "$(printf '%s' "$json" | field status.latestCreatedRevisionName)" == "$previous" ]]; then
      check_service "$json" "$manifest" "$name" "$region"
      if [[ "$region" == us-east1 ]]; then
        source_image="$(revision "$previous" "$region" | field spec.containers.0.image)"
      fi
      echo "✓ já atualizado e servindo $name/$region"
      continue
    fi
    if [[ "$current_digest" != "$digest" ]]; then
      check_service "$json" "$manifest" "$name" "$region"
      echo "✓ antigo verificado $name/$region"
      if [[ "$mode" == --deploy || "$mode" == --stage ]]; then
        suffix="e08$(date +%s)$RANDOM"
        if [[ "$region" == us-east1 ]]; then
          export_dir="$(mktemp -d)"
          git archive HEAD functions-autodraw | tar -x -C "$export_dir"
          runtime="$(node -p "require('./functions-autodraw/package.json').engines.node")"
          gcloud run deploy "$name" --project "$project" --region "$region" --source "$export_dir/functions-autodraw" \
            --function applyMatchResult --base-image "nodejs$runtime" --no-automatic-updates --revision-suffix "$suffix" \
            --set-env-vars "SP_SOURCE_DIGEST=$digest,SP_OPERATION_REGION=$region" --allow-unauthenticated \
            "${no_traffic[@]}" --quiet
          rm -rf "$export_dir"
        else
          [[ -n "$source_image" ]] || { echo 'imagem da região de origem ausente' >&2; exit 1; }
          gcloud run deploy "$name" --project "$project" --region "$region" --image "$source_image" \
            --revision-suffix "$suffix" --set-env-vars "SP_SOURCE_DIGEST=$digest,SP_OPERATION_REGION=$region" --allow-unauthenticated \
            "${no_traffic[@]}" --quiet
        fi
        json="$(describe "$name" "$region")"
        [[ "$(printf '%s' "$json" | field status.latestCreatedRevisionName)" == "$name-$suffix" ]] || {
          echo "revisão criada não corresponde ao deploy: $name/$region" >&2; exit 1;
        }
      fi
    fi
    if [[ "$current_digest" == "$digest" || "$mode" == --deploy || "$mode" == --stage ]]; then
      next="$(printf '%s' "$json" | field status.latestCreatedRevisionName)"
      [[ -n "$next" && "$next" != "$previous" ]] || { echo "revisão candidata ausente: $name/$region" >&2; exit 1; }
      next_json="$(revision "$next" "$region")"
      expected_image="$source_image"
      if [[ "$region" == us-east1 && "$current_digest" == "$digest" ]]; then
        # O manifesto só é promovido no fim da versão: numa retomada ele pode
        # guardar a imagem anterior. O candidato só fixa a imagem se registrar
        # exatamente esta revisão; senão a prova é SHA + digest/ambiente do rev.
        expected_image="$(SP_FILE="$candidate" SP_NAME="$name" SP_REGION="$region" SP_REVISION="$next" SP_DIGEST="$digest" node -e 'const fs=require("fs");if(!fs.existsSync(process.env.SP_FILE))process.exit(0);const x=JSON.parse(fs.readFileSync(process.env.SP_FILE));const r=x.find(v=>v.name===process.env.SP_NAME&&v.region===process.env.SP_REGION);if(r&&r.revision===process.env.SP_REVISION&&r.sourceDigest===process.env.SP_DIGEST)process.stdout.write(r.image)')"
      fi
      action="$(candidate_action "$json" "$next_json" "$previous" "$region" "$digest" "$expected_image")"
      if [[ "$action" == promote ]]; then check_old "$json" "$name" "$region"; fi
      if [[ "$mode" == --preflight ]]; then
        echo "✓ revisão candidata $name/$region: $action"
      elif [[ "$mode" == --stage ]]; then
        [[ "$action" == promote ]] || { echo "revisão candidata inesperada: $name/$region ($action)" >&2; exit 1; }
        record_stage "$json" "$next_json" "$candidate" "$name" "$region" "$digest" "$next"
        check_old "$json" "$name" "$region"
        echo "✓ revisão preparada sem tráfego $name/$region em $next"
      else
        if [[ "$action" == promote ]]; then
          gcloud run services update-traffic "$name" --project "$project" --region "$region" \
            --to-revisions "$next=100" --quiet || rollback_traffic "$name" "$region" "$previous"
        fi
        confirmed=0
        for attempt in {1..10}; do
          json="$(describe "$name" "$region")"
          next_json="$(revision "$next" "$region")"
          if check_promoted "$json" "$next_json" "$name" "$region" "$digest" "$next"; then confirmed=1; break; fi
          sleep 2
        done
        [[ "$confirmed" == 1 ]] || rollback_traffic "$name" "$region" "$previous"
        record "$json" "$next_json" "$candidate" "$name" "$region" "$digest"
        check_service "$json" "$candidate" "$name" "$region"
        echo "✓ tráfego confirmado $name/$region em $next"
      fi
      if [[ "$region" == us-east1 ]]; then source_image="$(printf '%s' "$next_json" | field spec.containers.0.image)"; fi
    fi
  done
  if [[ "$mode" == --deploy || "$mode" == --stage ]]; then
    SP_FILE="$candidate" SP_NAME="$name" SP_DIGEST="$digest" SP_REGIONS="${regions[*]}" node - <<'NODE'
const m=JSON.parse(require('fs').readFileSync(process.env.SP_FILE));
const rows=m.filter(x=>x.name===process.env.SP_NAME);
if(rows.length!==process.env.SP_REGIONS.split(' ').length||rows.some(x=>x.sourceDigest!==process.env.SP_DIGEST)||
  new Set(rows.map(x=>x.image)).size!==1)process.exit(1);
NODE
    if [[ "$mode" == --deploy ]]; then
      mv "$candidate" "$manifest"
      node scripts/check-operation-regions-mixed.js "$version"
      echo "✓ manifesto $version promovido após verificar todas as regiões"
    else
      echo "✓ manifesto candidato $version completo; tráfego antigo preservado"
    fi
  fi
done
if [[ "$mode" == --deploy ]]; then
  node scripts/generate-operation-regions-config.js
  node scripts/generate-operation-regions-v3-config.js
  echo '✓ oito portas verificadas e configurações públicas prontas; execute os checks do Hosting antes do upload'
fi

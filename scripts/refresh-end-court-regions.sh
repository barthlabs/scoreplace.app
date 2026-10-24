#!/usr/bin/env bash
# Atualiza somente endMatchOnCourt nas oito portas já usadas pelo cliente.
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:---preflight}"
[[ "$mode" == --preflight || "$mode" == --deploy ]] || exit 2
[[ -z "$(git status --porcelain)" ]] || { echo 'árvore suja' >&2; exit 1; }
node scripts/check-vendor-fresh.js
source_commit="$(git log -1 --format=%H -- functions-autodraw)"
[[ "$source_commit" =~ ^[a-f0-9]{40}$ ]] || exit 1
for old in 0510380cf595fd63ab6a79346a571c489513ca56 ecec288d9abe48f9e29697116024563a85dba28b; do
  diff="$(git diff --name-only "$old" HEAD -- functions functions-autodraw)"
  [[ "$diff" == functions-autodraw/index.js ]] || { echo "backend fora do corte: $diff" >&2; exit 1; }
  echo "✓ diff $old → HEAD: $diff"
done
for version in v2 v3; do
  node scripts/check-operation-regions-mixed.js "$version" --allow-legacy-court
done
if [[ "$mode" == --preflight ]]; then
  node scripts/generate-operation-regions-config.js --check
  node scripts/generate-operation-regions-v3-config.js --check
fi
if [[ "$mode" == --deploy && ! -e .claude/tmp/operation-regions-manifest-v2.end-court-candidate.json &&
      ! -e .claude/tmp/operation-regions-manifest-v3.end-court-candidate.json ]]; then
  # Confronta as oito portas antes da primeira mudança. Numa retomada, cada
  # porta já atualizada é verificada contra o candidato salvo no loop abaixo.
  bash "$0" --preflight
fi

project=scoreplace-app
describe() { gcloud run services describe "$1" --project "$project" --region "$2" --format=json; }
field() { node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{let x=JSON.parse(s);for(const p of process.argv[1].split("."))x=x?.[p];process.stdout.write(x==null?"":String(x))})' "$1"; }
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
  SP_JSON="$json" SP_FILE="$file" SP_NAME="$name" SP_REGION="$region" node - <<'NODE'
const fs=require('fs'),m=JSON.parse(fs.readFileSync(process.env.SP_FILE));
const rows=m.filter(x=>x.name===process.env.SP_NAME&&x.region===process.env.SP_REGION);
if(rows.length!==1)process.exit(1);
const r=rows[0],s=JSON.parse(process.env.SP_JSON),e=Object.fromEntries((s.spec?.template?.spec?.containers?.[0]?.env||[]).map(x=>[x.name,x.value]));
if(r.image!==s.spec?.template?.spec?.containers?.[0]?.image||r.revision!==s.status?.latestReadyRevisionName||
  r.url!==s.status?.url||e.SP_SOURCE_DIGEST!==r.sourceDigest||e.SP_OPERATION_REGION!==r.region||
  s.spec?.template?.metadata?.annotations?.['run.googleapis.com/base-images'])process.exit(1);
NODE
  probe "$(printf '%s' "$json" | field status.url)"
}
record() {
  local json="$1" file="$2" name="$3" region="$4" digest="$5"
  SP_JSON="$json" SP_FILE="$file" SP_NAME="$name" SP_REGION="$region" SP_DIGEST="$digest" SP_COMMIT="$source_commit" node - <<'NODE'
const fs=require('fs'),s=JSON.parse(process.env.SP_JSON),e=Object.fromEntries((s.spec?.template?.spec?.containers?.[0]?.env||[]).map(x=>[x.name,x.value]));
const m=JSON.parse(fs.readFileSync(process.env.SP_FILE));
const i=m.findIndex(x=>x.name===process.env.SP_NAME&&x.region===process.env.SP_REGION);
const old=m[i];
if(i<0||e.SP_SOURCE_DIGEST!==process.env.SP_DIGEST||e.SP_OPERATION_REGION!==process.env.SP_REGION||
  !s.spec?.template?.spec?.containers?.[0]?.image?.includes('@sha256:')||
  !s.status?.url||s.status.url!==old.url||!s.status?.latestReadyRevisionName||s.spec?.template?.metadata?.annotations?.['run.googleapis.com/base-images'])process.exit(1);
m[i]={name:process.env.SP_NAME,region:process.env.SP_REGION,target:'endMatchOnCourt',codebase:'functions-autodraw',
  commit:process.env.SP_COMMIT,sourceDigest:process.env.SP_DIGEST,
  image:s.spec.template.spec.containers[0].image,url:s.status.url,revision:s.status.latestReadyRevisionName,env:e};
fs.writeFileSync(process.env.SP_FILE,JSON.stringify(m,null,2)+'\n');
NODE
}

for version in v3 v2; do
  name="sp-op-end-court-$version"
  manifest=".claude/tmp/operation-regions-manifest-$version.json"
  candidate=".claude/tmp/operation-regions-manifest-$version.end-court-candidate.json"
  if [[ "$version" == v3 ]]; then
    regions=(us-east1 us-east4 us-south1 us-central1 southamerica-east1)
  else
    regions=(us-east1 us-east4 us-south1)
  fi
  digest="$(node scripts/operation-source-digest.js functions-autodraw endMatchOnCourt "$source_commit")"
  if [[ "$mode" == --deploy && ! -e "$candidate" ]]; then cp "$manifest" "$candidate"; fi
  source_image=''
  for region in "${regions[@]}"; do
    json="$(describe "$name" "$region")"
    current_digest="$(printf '%s' "$json" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const x=JSON.parse(s);process.stdout.write((x.spec?.template?.spec?.containers?.[0]?.env||[]).find(e=>e.name==="SP_SOURCE_DIGEST")?.value||"")})')"
    if [[ "$current_digest" == "$digest" ]]; then
      receipt="$candidate"
      [[ -e "$receipt" ]] || receipt="$manifest"
      check_service "$json" "$receipt" "$name" "$region"
      echo "✓ já atualizado $name/$region"
    else
      check_service "$json" "$manifest" "$name" "$region"
      echo "✓ antigo verificado $name/$region"
      if [[ "$mode" == --deploy ]]; then
        if [[ "$region" == us-east1 ]]; then
          export_dir="$(mktemp -d)"
          git archive HEAD functions-autodraw | tar -x -C "$export_dir"
          runtime="$(node -p "require('./functions-autodraw/package.json').engines.node")"
          gcloud run deploy "$name" --project "$project" --region "$region" --source "$export_dir/functions-autodraw" \
            --function endMatchOnCourt --base-image "nodejs$runtime" --no-automatic-updates \
            --set-env-vars "SP_SOURCE_DIGEST=$digest,SP_OPERATION_REGION=$region" --allow-unauthenticated --quiet
          rm -rf "$export_dir"
        else
          [[ -n "$source_image" ]] || { echo 'imagem da região de origem ausente' >&2; exit 1; }
          gcloud run deploy "$name" --project "$project" --region "$region" --image "$source_image" \
            --set-env-vars "SP_SOURCE_DIGEST=$digest,SP_OPERATION_REGION=$region" --allow-unauthenticated --quiet
        fi
        json="$(describe "$name" "$region")"
        record "$json" "$candidate" "$name" "$region" "$digest"
        check_service "$json" "$candidate" "$name" "$region"
        echo "✓ publicado $name/$region"
      fi
    fi
    if [[ "$region" == us-east1 ]]; then source_image="$(printf '%s' "$json" | field spec.template.spec.containers.0.image)"; fi
  done
  if [[ "$mode" == --deploy ]]; then
    SP_FILE="$candidate" SP_NAME="$name" SP_DIGEST="$digest" SP_REGIONS="${regions[*]}" node - <<'NODE'
const m=JSON.parse(require('fs').readFileSync(process.env.SP_FILE));
const rows=m.filter(x=>x.name===process.env.SP_NAME);
if(rows.length!==process.env.SP_REGIONS.split(' ').length||rows.some(x=>x.sourceDigest!==process.env.SP_DIGEST)||
  new Set(rows.map(x=>x.image)).size!==1)process.exit(1);
NODE
    mv "$candidate" "$manifest"
    node scripts/check-operation-regions-mixed.js "$version"
    echo "✓ manifesto $version promovido após verificar todas as regiões"
  fi
done
if [[ "$mode" == --deploy ]]; then
  node scripts/generate-operation-regions-config.js
  node scripts/generate-operation-regions-v3-config.js
  echo '✓ oito portas verificadas e configurações públicas prontas; execute os checks do Hosting antes do upload'
fi

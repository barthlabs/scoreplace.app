#!/usr/bin/env bash
# Atualiza somente endMatchOnCourt nas oito portas já usadas pelo cliente.
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:---preflight}"
[[ "$mode" == --preflight || "$mode" == --deploy ]] || exit 2
[[ -z "$(git status --porcelain)" ]] || { echo 'árvore suja' >&2; exit 1; }
node scripts/check-vendor-fresh.js
source_commit="$(node -e "process.stdout.write(require('./scripts/autodraw-publication-git').ultimoAutodrawImplantavel(process.cwd())||'')")"
[[ "$source_commit" =~ ^[a-f0-9]{40}$ ]] || exit 1
base_commit='3690dc4d6287eed4a029d9051e3db8022a62d99e'
git cat-file -e "$base_commit^{commit}"
git merge-base --is-ancestor "$base_commit" "$source_commit" || {
  echo "base regional $base_commit não é ancestral de $source_commit" >&2; exit 1;
}
required_manifest='.backend-requerido-autodraw.json'
node - "$source_commit" "$required_manifest" <<'NODE'
const fs=require('fs');
const {checkTargetedPublication,autodrawExports}=require('./scripts/backend-publication-core');
const [commit,file]=process.argv.slice(2);
const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
const receipt=JSON.parse(fs.readFileSync('.backend-publicado-autodraw-funcoes.json','utf8'));
const names=['createTournament','tournamentSummary','tournamentSummaryMatch','tournamentSummaryParticipant',
  'tournamentSummaryRegistration','tournamentSummaryLegacyGroup','endMatchOnCourt'];
const exports=autodrawExports(fs.readFileSync('functions-autodraw/index.js','utf8'));
if(manifest.backendCommit!==commit||manifest.functions.length!==names.length||new Set(manifest.functions).size!==names.length||
  names.some(name=>!manifest.functions.includes(name)))throw Error('manifesto requerido não cobre exatamente as sete funções/commit');
const checked=checkTargetedPublication(manifest,receipt,commit,exports);
if(!checked.ok||checked.verified.length!==names.length)throw Error(checked.reason||'receipt central incompleto');
NODE
diff="$(git diff --name-only "$base_commit" "$source_commit" -- functions-autodraw | LC_ALL=C sort)"
expected="$(printf '%s\n' \
  functions-autodraw/court-capability-digest.js \
  functions-autodraw/index.js \
  functions-autodraw/test-tournament-summary-reconcile.js \
  functions-autodraw/tournament-create.js \
  functions-autodraw/tournament-summary-core.js \
  functions-autodraw/tournament-summary-reconcile.js \
  functions-autodraw/vendor/tournaments-utils.js | LC_ALL=C sort)"
[[ "$diff" == "$expected" ]] || {
  echo "backend fora do corte end-court/summaries: $diff" >&2; exit 1;
}
echo "✓ diff $base_commit → HEAD: $diff"
for version in v2 v3; do
  node scripts/check-operation-regions-mixed.js "$version" --allow-legacy-court
done
if [[ "$mode" == --deploy ]]; then
  # Revalida as oito portas sem escrita antes de cada tentativa, inclusive retomadas.
  bash "$0" --preflight
fi

project=scoreplace-app
regional_digest="$(node scripts/operation-source-digest.js functions-autodraw endMatchOnCourt "$source_commit" --from-git)"
central_digest="$(node scripts/central-source-digest.js "$source_commit")"
[[ -z "$(git diff --name-only "$source_commit" HEAD -- functions-autodraw)" ]] || {
  echo 'fontes endMatchOnCourt divergiram do commit de origem' >&2; exit 1;
}
if [[ "$mode" == --deploy ]]; then
  source scripts/firebase-credencial-persistente.sh
  sp_preparar_credencial_firebase "$PWD" "$project"
  node scripts/end-court-readiness.js --invalidate
fi
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
promote_served_candidate() {
  local json="$1" file="$2" name="$3" region="$4" digest="$5" revision_json candidate decision
  candidate="$(printf '%s' "$json" | field status.latestCreatedRevisionName)"
  [[ -n "$candidate" ]] || { echo "revisão candidata ausente: $name/$region" >&2; exit 1; }
  revision_json="$(gcloud run revisions describe "$candidate" --project "$project" --region "$region" --format=json)"
  decision="$(SP_SERVICE_JSON="$json" SP_REVISION_JSON="$revision_json" SP_FILE="$file" SP_NAME="$name" SP_REGION="$region" SP_DIGEST="$digest" node - <<'NODE'
const fs = require('fs');
const { candidateDecision, checkServed } = require('./scripts/check-served-operation-revision');
const service = JSON.parse(process.env.SP_SERVICE_JSON);
const revision = JSON.parse(process.env.SP_REVISION_JSON);
const rows = JSON.parse(fs.readFileSync(process.env.SP_FILE));
const row = rows.find(item => item.name === process.env.SP_NAME && item.region === process.env.SP_REGION);
if (!row || row.sourceDigest !== process.env.SP_DIGEST) process.exit(1);
const previousRevision = service.status?.traffic?.[0]?.revisionName;
if (!previousRevision || (previousRevision !== row.revision && previousRevision !== service.status?.latestCreatedRevisionName)) process.exit(1);
if (previousRevision === service.status.latestCreatedRevisionName) {
  checkServed(service, revision, { ...row, revision: previousRevision });
  process.stdout.write('current');
  process.exit(0);
}
const result = candidateDecision(service, revision, {
  previousRevision, revision: service.status.latestCreatedRevisionName,
  sourceDigest: row.sourceDigest, image: row.image, region: row.region, url: row.url
});
process.stdout.write(result.action);
NODE
)"
  if [[ "$decision" == promote ]]; then
    gcloud run services update-traffic "$name" --project "$project" --region "$region" \
      --to-revisions "$candidate=100" --quiet
  elif [[ "$decision" != current ]]; then
    echo "decisão de tráfego inesperada: $name/$region" >&2; exit 1
  fi
  json="$(describe "$name" "$region")"
  SP_SERVICE_JSON="$json" SP_REVISION_JSON="$revision_json" SP_FILE="$file" SP_NAME="$name" SP_REGION="$region" SP_CANDIDATE="$candidate" node - <<'NODE'
const fs = require('fs');
const { checkServed } = require('./scripts/check-served-operation-revision');
const service = JSON.parse(process.env.SP_SERVICE_JSON);
const revision = JSON.parse(process.env.SP_REVISION_JSON);
const rows = JSON.parse(fs.readFileSync(process.env.SP_FILE));
const row = rows.find(item => item.name === process.env.SP_NAME && item.region === process.env.SP_REGION);
checkServed(service, revision, { ...row, revision: process.env.SP_CANDIDATE });
row.revision = process.env.SP_CANDIDATE;
fs.writeFileSync(process.env.SP_FILE, JSON.stringify(rows, null, 2) + '\n');
NODE
  echo "✓ tráfego efetivo $name/$region → $candidate"
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
  digest="$regional_digest"
  if [[ "$mode" == --deploy && ! -e "$candidate" ]]; then cp "$manifest" "$candidate"; fi
  source_image=''
  for region in "${regions[@]}"; do
    json="$(describe "$name" "$region")"
    current_digest="$(printf '%s' "$json" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const x=JSON.parse(s);process.stdout.write((x.spec?.template?.spec?.containers?.[0]?.env||[]).find(e=>e.name==="SP_SOURCE_DIGEST")?.value||"")})')"
    if [[ "$current_digest" == "$digest" ]]; then
      receipt="$candidate"
      [[ -e "$receipt" ]] || receipt="$manifest"
      if [[ "$mode" == --deploy ]]; then
        promote_served_candidate "$json" "$receipt" "$name" "$region" "$digest"
        json="$(describe "$name" "$region")"
      fi
      check_service "$json" "$receipt" "$name" "$region"
      echo "✓ já atualizado $name/$region"
    else
      check_service "$json" "$manifest" "$name" "$region"
      echo "✓ antigo verificado $name/$region"
      if [[ "$mode" == --deploy ]]; then
        if [[ "$region" == us-east1 ]]; then
          export_dir="$(mktemp -d)"
          git archive "$source_commit" functions-autodraw | tar -x -C "$export_dir"
          runtime="$(node -p "JSON.parse(require('child_process').execFileSync('git',['show','$source_commit:functions-autodraw/package.json'],{encoding:'utf8'})).engines.node")"
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
        promote_served_candidate "$json" "$candidate" "$name" "$region" "$digest"
        json="$(describe "$name" "$region")"
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
  node scripts/end-court-readiness.js --ready "$required_manifest"
  echo '✓ oito portas verificadas e configurações públicas prontas; execute os checks do Hosting antes do upload'
fi

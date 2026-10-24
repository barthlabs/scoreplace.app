#!/usr/bin/env bash
# Publica seis portas v3 em cinco regiões sem tocar nas portas v2 em produção.
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:---check-v3}"
[[ "$mode" == --deploy-v3 || "$mode" == --resume-v3 || "$mode" == --retarget-v3 || "$mode" == --check-v3 || "$mode" == --check-v2-live ]] || exit 2
project=scoreplace-app
regions=(us-east1 us-east4 us-south1 us-central1 southamerica-east1)
names=(sp-op-court-v3 sp-op-score-v3 sp-op-presence-v3 sp-op-presence-wo-v3 sp-op-end-court-v3 sp-op-control-v3)
targets=(assignMatchCourt applyMatchResult setTournamentPresence setTournamentPresenceWithWOSubstitution endMatchOnCourt tournamentOperationControl)
codebases=(functions-autodraw functions-autodraw functions functions-autodraw functions-autodraw functions-autodraw)
manifest=.claude/tmp/operation-regions-manifest-v3.json
candidate=.claude/tmp/operation-regions-manifest-v3.next.json
original=.claude/tmp/operation-regions-manifest-v3.original.json
oldmanifest=.claude/tmp/operation-regions-manifest-v2.json
mkdir -p .claude/tmp
check_tree() { [[ -z "$(git status --porcelain)" ]] || { echo 'árvore suja' >&2; exit 1; }; node scripts/check-vendor-fresh.js; }
describe() { gcloud run services describe "$1" --project "$project" --region "$2" --format=json 2>/dev/null; }
field() { node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{let x=JSON.parse(s);for(const p of process.argv[1].split("."))x=x?.[p];process.stdout.write(x==null?"":String(x))})' "$1"; }
probe_no_auth() {
  local file code
  file="$(mktemp)"
  code="$(curl -sS --max-time 20 -o "$file" -w '%{http_code}' -H 'content-type: application/json' -d '{"data":{"probe":true}}' "$1")"
  [[ "$code" == 401 || "$code" == 403 ]] || { echo "sonda HTTP $code: $1" >&2; rm -f "$file"; exit 1; }
  node - "$file" <<'NODE'
const x=JSON.parse(require('fs').readFileSync(process.argv[2]));
if(!['UNAUTHENTICATED','unauthenticated'].includes(x.error?.status))process.exit(1);
NODE
  rm -f "$file"
}
verify_row() {
  local name="$1" region="$2" target="$3" codebase="$4" source_commit="$5" json="$6" file="$7"
  SP_NAME="$name" SP_REGION="$region" SP_TARGET="$target" SP_CODEBASE="$codebase" SP_COMMIT="$source_commit" SP_JSON="$json" SP_FILE="$file" node - <<'NODE'
const fs=require('fs'), rows=JSON.parse(fs.readFileSync(process.env.SP_FILE)), s=JSON.parse(process.env.SP_JSON);
const r=rows.find(x=>x.name===process.env.SP_NAME&&x.region===process.env.SP_REGION);
const env=Object.fromEntries((s.spec?.template?.spec?.containers?.[0]?.env||[]).map(x=>[x.name,x.value]));
if(!r||r.target!==process.env.SP_TARGET||r.codebase!==process.env.SP_CODEBASE||r.commit!==process.env.SP_COMMIT||
  r.image!==s.spec?.template?.spec?.containers?.[0]?.image||r.revision!==s.status?.latestReadyRevisionName||
  r.url!==s.status?.url||env.SP_SOURCE_DIGEST!==r.sourceDigest||env.SP_OPERATION_REGION!==r.region||
  !r.image?.includes('@sha256:')||s.spec?.template?.metadata?.annotations?.['run.googleapis.com/base-images'])process.exit(1);
NODE
  probe_no_auth "$(printf '%s' "$json" | field status.url)"
}
record() {
  local name="$1" region="$2" target="$3" codebase="$4" commit="$5" digest="$6" json="$7"
  SP_NAME="$name" SP_REGION="$region" SP_TARGET="$target" SP_CODEBASE="$codebase" SP_COMMIT="$commit" SP_DIGEST="$digest" SP_JSON="$json" SP_FILE="$candidate" node - <<'NODE'
const fs=require('fs'),s=JSON.parse(process.env.SP_JSON),e=Object.fromEntries((s.spec?.template?.spec?.containers?.[0]?.env||[]).map(x=>[x.name,x.value]));
const row={name:process.env.SP_NAME,region:process.env.SP_REGION,target:process.env.SP_TARGET,codebase:process.env.SP_CODEBASE,commit:process.env.SP_COMMIT,sourceDigest:process.env.SP_DIGEST,image:s.spec?.template?.spec?.containers?.[0]?.image,url:s.status?.url,revision:s.status?.latestReadyRevisionName,env:e};
if(!row.image?.includes('@sha256:')||!row.url||!row.revision||e.SP_SOURCE_DIGEST!==row.sourceDigest||e.SP_OPERATION_REGION!==row.region||s.spec?.template?.metadata?.annotations?.['run.googleapis.com/base-images'])process.exit(1);
const rows=fs.existsSync(process.env.SP_FILE)?JSON.parse(fs.readFileSync(process.env.SP_FILE)):[];
const i=rows.findIndex(x=>x.name===row.name&&x.region===row.region);
if(i>=0)rows[i]=row;else rows.push(row);
fs.writeFileSync(process.env.SP_FILE,JSON.stringify(rows,null,2)+'\n');
NODE
}
if [[ "$mode" == --check-v2-live ]]; then
  [[ -s "$oldmanifest" ]] || { echo 'manifesto v2 ausente' >&2; exit 1; }
  node scripts/check-operation-regions-mixed.js v2
  oldcommit="$(node -e 'const m=require("./.claude/tmp/operation-regions-manifest-v2.json");process.stdout.write(m.find(x=>x.name!=="sp-op-end-court-v2").commit)')"
  git show "$oldcommit:functions-autodraw/index.js" | rg "new Set\(\['us-east1', 'us-east4', 'us-south1'\]\)" >/dev/null || { echo 'v2 não possui Set histórico esperado' >&2; exit 1; }
  for i in "${!names[@]}"; do
    name="${names[$i]/-v3/-v2}"; target="${targets[$i]}"; codebase="${codebases[$i]}"; image=''
    for region in "${regions[@]:0:3}"; do
      json="$(describe "$name" "$region")" || exit 1
      row_commit="$(SP_FILE="$oldmanifest" SP_NAME="$name" node -e 'const m=require("./"+process.env.SP_FILE);process.stdout.write(m.find(x=>x.name===process.env.SP_NAME).commit)')"
      verify_row "$name" "$region" "$target" "$codebase" "$row_commit" "$json" "$oldmanifest"
      this_image="$(printf '%s' "$json" | field spec.template.spec.containers.0.image)"
      [[ -z "$image" || "$image" == "$this_image" ]] || exit 1
      image="$this_image"
      echo "✓ v2 $name/$region"
    done
  done
  node scripts/generate-operation-regions-config.js --check
  exit 0
fi
check_tree
commit="$(git rev-parse HEAD)"
if [[ "$mode" == --deploy-v3 || "$mode" == --resume-v3 || "$mode" == --retarget-v3 ]]; then
  [[ ! -s "$manifest" ]] || { echo 'v3 já possui manifesto final' >&2; exit 1; }
  if [[ "$mode" == --deploy-v3 ]]; then
    [[ ! -e "$candidate" ]] || { echo 'candidato parcial existente; use --resume-v3' >&2; exit 1; }
    existing="$(gcloud functions list --project "$project" --format='value(name)')"
    for region in "${regions[@]}"; do for name in "${names[@]}"; do
      if describe "$name" "$region" >/dev/null || printf '%s\n' "$existing" | rg -q "(^|/)$name$"; then echo "porta v3 existente: $name/$region" >&2; exit 1; fi
    done; done
    printf '[]\n' > "$candidate"
  fi
  if [[ "$mode" == --retarget-v3 ]]; then
    [[ ! -e "$original" && -s "$candidate" ]] || { echo 'retarget já iniciado ou candidato ausente' >&2; exit 1; }
    node - "$candidate" <<'NODE'
const rows=JSON.parse(require('fs').readFileSync(process.argv[2]));
if(rows.length!==3||rows.some(r=>r.name!=='sp-op-court-v3'||!['us-east1','us-east4','us-south1'].includes(r.region))||new Set(rows.map(r=>r.region)).size!==3||new Set(rows.map(r=>r.commit)).size!==1)process.exit(1);
NODE
    for region in us-east1 us-east4 us-south1; do
      json="$(describe sp-op-court-v3 "$region")" || exit 1
      oldcommit="$(node -e 'const m=require("./.claude/tmp/operation-regions-manifest-v3.next.json");process.stdout.write(m[0].commit)')"
      verify_row sp-op-court-v3 "$region" assignMatchCourt functions-autodraw "$oldcommit" "$json" "$candidate"
    done
    for name in "${names[@]}"; do for region in "${regions[@]}"; do
      if [[ "$name" == sp-op-court-v3 && ( "$region" == us-east1 || "$region" == us-east4 || "$region" == us-south1 ) ]]; then continue; fi
      if describe "$name" "$region" >/dev/null; then echo "porta v3 inesperada: $name/$region" >&2; exit 1; fi
    done; done
    [[ "$(curl -sS -o /dev/null -w '%{http_code}' https://scoreplace.app/operation-regions-v3.json)" == 404 ]] || { echo 'v3 já está público' >&2; exit 1; }
    cp "$candidate" "$original"
    printf '[]\n' > "$candidate"
  fi
  if [[ -s "$original" ]]; then
    [[ "$(curl -sS -o /dev/null -w '%{http_code}' https://scoreplace.app/operation-regions-v3.json)" == 404 ]] || { echo 'v3 já está público' >&2; exit 1; }
  fi
  [[ -s "$candidate" ]] || exit 1
  node - "$candidate" "$commit" <<'NODE'
const m=require('fs').readFileSync(process.argv[2]);const rows=JSON.parse(m);
if(rows.some(r=>r.commit!==process.argv[3]))process.exit(1);
NODE
  for i in "${!names[@]}"; do
    name="${names[$i]}"; target="${targets[$i]}"; codebase="${codebases[$i]}"
    digest="$(node scripts/operation-source-digest.js "$codebase" "$target" "$commit")"
    source_json=''
    for region in "${regions[@]}"; do
      if json="$(describe "$name" "$region")"; then
        if [[ -s "$original" && "$name" == sp-op-court-v3 && ( "$region" == us-east1 || "$region" == us-east4 || "$region" == us-south1 ) ]]; then
          current_digest="$(printf '%s' "$json" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const x=JSON.parse(s);process.stdout.write((x.spec?.template?.spec?.containers?.[0]?.env||[]).find(e=>e.name==="SP_SOURCE_DIGEST")?.value||"")})')"
          if [[ "$current_digest" != "$digest" ]]; then
            oldcommit="$(node -e 'const m=require("./.claude/tmp/operation-regions-manifest-v3.original.json");process.stdout.write(m[0].commit)')"
            verify_row "$name" "$region" "$target" "$codebase" "$oldcommit" "$json" "$original"
            if [[ "$region" == us-east1 ]]; then
              runtime="$(node -p "require('./$codebase/package.json').engines.node")"
              gcloud run deploy "$name" --project "$project" --region "$region" --source "$codebase" --function "$target" \
                --base-image "nodejs$runtime" --no-automatic-updates \
                --set-env-vars "SP_SOURCE_DIGEST=$digest,SP_OPERATION_REGION=$region" --allow-unauthenticated --quiet
            else
              [[ -n "$source_json" ]] || exit 1
              image="$(printf '%s' "$source_json" | field spec.template.spec.containers.0.image)"
              gcloud run deploy "$name" --project "$project" --region "$region" --image "$image" \
                --set-env-vars "SP_SOURCE_DIGEST=$digest,SP_OPERATION_REGION=$region" --allow-unauthenticated --quiet
            fi
            json="$(describe "$name" "$region")" || exit 1
          else
            SP_FILE="$candidate" SP_NAME="$name" SP_REGION="$region" node - <<'NODE' || { echo 'revisão nova sem recibo; reconciliação manual necessária' >&2; exit 1; }
const fs=require('fs'),rows=JSON.parse(fs.readFileSync(process.env.SP_FILE));
if(!rows.some(r=>r.name===process.env.SP_NAME&&r.region===process.env.SP_REGION))process.exit(1);
NODE
            verify_row "$name" "$region" "$target" "$codebase" "$commit" "$json" "$candidate"
          fi
        fi
        SP_JSON="$json" SP_DIGEST="$digest" SP_REGION="$region" node - <<'NODE'
const s=JSON.parse(process.env.SP_JSON),e=Object.fromEntries((s.spec?.template?.spec?.containers?.[0]?.env||[]).map(x=>[x.name,x.value]));
if(e.SP_SOURCE_DIGEST!==process.env.SP_DIGEST||e.SP_OPERATION_REGION!==process.env.SP_REGION||!s.spec?.template?.spec?.containers?.[0]?.image?.includes('@sha256:')||!s.status?.latestReadyRevisionName||!s.status?.url)process.exit(1);
NODE
        if [[ "$region" != us-east1 ]]; then
          [[ -n "$source_json" ]] || { echo 'fonte ausente para réplica' >&2; exit 1; }
          [[ "$(printf '%s' "$json" | field spec.template.spec.containers.0.image)" == "$(printf '%s' "$source_json" | field spec.template.spec.containers.0.image)" ]] || exit 1
        fi
        record "$name" "$region" "$target" "$codebase" "$commit" "$digest" "$json"
        verify_row "$name" "$region" "$target" "$codebase" "$commit" "$json" "$candidate"
        echo "✓ existente $name/$region"
      else
        if [[ "$region" == us-east1 ]]; then
          runtime="$(node -p "require('./$codebase/package.json').engines.node")"
          gcloud run deploy "$name" --project "$project" --region "$region" --source "$codebase" --function "$target" \
            --base-image "nodejs$runtime" --no-automatic-updates \
            --set-env-vars "SP_SOURCE_DIGEST=$digest,SP_OPERATION_REGION=$region" --allow-unauthenticated --quiet
        else
          [[ -n "$source_json" ]] || { echo 'fonte ausente para réplica' >&2; exit 1; }
          image="$(printf '%s' "$source_json" | field spec.template.spec.containers.0.image)"
          gcloud run deploy "$name" --project "$project" --region "$region" --image "$image" \
            --set-env-vars "SP_SOURCE_DIGEST=$digest,SP_OPERATION_REGION=$region" --allow-unauthenticated --quiet
        fi
        json="$(describe "$name" "$region")"
        record "$name" "$region" "$target" "$codebase" "$commit" "$digest" "$json"
        verify_row "$name" "$region" "$target" "$codebase" "$commit" "$json" "$candidate"
        echo "✓ novo $name/$region"
      fi
      [[ "$region" == us-east1 ]] && source_json="$json"
    done
  done
  [[ "$(node -e 'process.stdout.write(String(require("./.claude/tmp/operation-regions-manifest-v3.next.json").length))')" == 30 ]] || exit 1
  mv "$candidate" "$manifest"
fi
[[ -s "$manifest" ]] || { echo 'manifesto v3 ausente' >&2; exit 1; }
# As portas antigas preservam o digest já registrado; somente end-court usa
# a árvore atual. O verificador confirma essa exceção e o serviço vivo abaixo.
node scripts/check-operation-regions-mixed.js v3
for i in "${!names[@]}"; do
  name="${names[$i]}"; target="${targets[$i]}"; codebase="${codebases[$i]}"; image=''
  row_commit="$(SP_FILE="$manifest" SP_NAME="$name" node -e 'const m=require("./"+process.env.SP_FILE);process.stdout.write(m.find(x=>x.name===process.env.SP_NAME).commit)')"
  for region in "${regions[@]}"; do
    json="$(describe "$name" "$region")" || exit 1
    verify_row "$name" "$region" "$target" "$codebase" "$row_commit" "$json" "$manifest"
    this_image="$(printf '%s' "$json" | field spec.template.spec.containers.0.image)"
    [[ -z "$image" || "$image" == "$this_image" ]] || exit 1
    image="$this_image"
    SP_FILE="$manifest" SP_NAME="$name" SP_REGION="$region" node - <<'NODE'
const m=require('fs').readFileSync(process.env.SP_FILE),r=JSON.parse(m).find(x=>x.name===process.env.SP_NAME&&x.region===process.env.SP_REGION);
if(!r?.sourceDigest)process.exit(1);
NODE
    echo "✓ v3 $name/$region"
  done
done

#!/usr/bin/env bash
# Publica a trava condicional nas portas atuais. Não ativa protocolo em torneio.
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:---check}"
[[ "$mode" == '--deploy' || "$mode" == '--check' ]] || exit 2
project=scoreplace-app
region=us-east1
source_manifest=.claude/tmp/operation-regions-manifest-v2.json
gate_manifest=.claude/tmp/operation-legacy-gate-manifest-v2.json
recovery=(assignmatchcourt-run-recovery applymatchresult-run-recovery settournamentpresence-run-recovery presencwo-run-recovery)
regional=(sp-op-court-v2 sp-op-score-v2 sp-op-presence-v2 sp-op-presence-wo-v2)
targets=(assignMatchCourt applyMatchResult setTournamentPresence setTournamentPresenceWithWOSubstitution)
normal=(setTournamentPresence applyMatchResult applyQueuedResult assignMatchCourt setTournamentPresenceWithWOSubstitution endMatchOnCourt)

[[ -z "$(git status --porcelain)" ]] || { echo 'árvore suja' >&2; exit 1; }
scripts/deploy-operation-regions.sh --check-v2
[[ -f "$source_manifest" ]] || { echo 'manifesto regional ausente' >&2; exit 1; }
source_commit="$(SP_MANIFEST="$source_manifest" node -e 'const m=require("./"+process.env.SP_MANIFEST);const s=[...new Set(m.map(x=>x.commit))];if(s.length!==1)process.exit(1);process.stdout.write(s[0])')"
git diff --quiet "$source_commit" HEAD -- functions functions-autodraw || { echo 'codebase mudou após build regional' >&2; exit 1; }
describe_run() { gcloud run services describe "$1" --project "$project" --region "$region" --format=json; }
describe_fn() { gcloud functions describe "$1" --project "$project" --region us-central1 --gen2 --format=json; }
validate_before() {
  for i in "${!recovery[@]}"; do
    SP_JSON="$(describe_run "${recovery[$i]}")" SP_TARGET="${targets[$i]}" node - <<'NODE'
const s=JSON.parse(process.env.SP_JSON);
if(s.metadata?.annotations?.['run.googleapis.com/build-function-target']!==process.env.SP_TARGET ||
   !s.status?.latestReadyRevisionName || !s.status?.url) process.exit(1);
NODE
  done
  for name in "${normal[@]}"; do
    SP_JSON="$(describe_fn "$name")" SP_TARGET="$name" node - <<'NODE'
const f=JSON.parse(process.env.SP_JSON);
if(f.state!=='ACTIVE'||f.buildConfig?.entryPoint!==process.env.SP_TARGET) process.exit(1);
NODE
  done
}
probe_no_auth() {
  local file code
  file="$(mktemp)"
  code="$(curl -sS --max-time 15 -o "$file" -w '%{http_code}' -H 'content-type: application/json' -d '{"data":{"probe":true}}' "$1")"
  [[ "$code" == 401 || "$code" == 403 ]] || { echo "sonda sem Auth: HTTP $code" >&2; rm -f "$file"; exit 1; }
  node - "$file" <<'NODE'
const x=JSON.parse(require('fs').readFileSync(process.argv[2]));
if(!['UNAUTHENTICATED','unauthenticated'].includes(x.error?.status))process.exit(1);
NODE
  rm -f "$file"
}

if [[ "$mode" == '--deploy' ]]; then
  [[ "$(git branch --show-current)" == codex/regional-failover-b2 ]] || { echo 'branch B2 obrigatória' >&2; exit 1; }
  [[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/codex/regional-failover-b2)" ]] || { echo 'branch remota divergente' >&2; exit 1; }
  [[ ! -e "$gate_manifest" ]] || { echo 'trava já iniciada; verifique antes de repetir' >&2; exit 1; }
  validate_before
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  SP_STARTED="$started" SP_SOURCE="$source_commit" SP_OUT="$gate_manifest" node - <<'NODE'
require('fs').writeFileSync(process.env.SP_OUT,JSON.stringify({startedAt:process.env.SP_STARTED,sourceCommit:process.env.SP_SOURCE,recovery:[],normal:[]},null,2)+'\n');
NODE
  bash scripts/deploy-functions.sh main --only setTournamentPresence
  bash scripts/deploy-functions.sh autodraw --only applyMatchResult,applyQueuedResult,assignMatchCourt,setTournamentPresenceWithWOSubstitution,endMatchOnCourt
  for i in "${!recovery[@]}"; do
    row="$(SP_MANIFEST="$source_manifest" SP_NAME="${regional[$i]}" node -e 'const m=require("./"+process.env.SP_MANIFEST);const r=m.find(x=>x.name===process.env.SP_NAME&&x.region==="us-east1");if(!r)process.exit(1);process.stdout.write(JSON.stringify(r))')"
    image="$(SP_ROW="$row" node -e 'process.stdout.write(JSON.parse(process.env.SP_ROW).image)')"
    digest="$(SP_ROW="$row" node -e 'process.stdout.write(JSON.parse(process.env.SP_ROW).sourceDigest)')"
    gcloud run deploy "${recovery[$i]}" --project "$project" --region "$region" --image "$image" \
      --set-env-vars "SP_SOURCE_DIGEST=$digest,SP_OPERATION_REGION=$region" --allow-unauthenticated --quiet
  done
  SP_OUT="$gate_manifest" SP_RECOVERY="${recovery[*]}" SP_NORMAL="${normal[*]}" SP_PROJECT="$project" node - <<'NODE'
const fs=require('fs'),cp=require('child_process'),m=JSON.parse(fs.readFileSync(process.env.SP_OUT));
const run=(a)=>JSON.parse(cp.execFileSync('gcloud',a,{encoding:'utf8'}));
m.recovery=process.env.SP_RECOVERY.split(' ').map(name=>{const s=run(['run','services','describe',name,'--project',process.env.SP_PROJECT,'--region','us-east1','--format=json']);return {name,image:s.spec?.template?.spec?.containers?.[0]?.image,revision:s.status?.latestReadyRevisionName,url:s.status?.url};});
m.normal=process.env.SP_NORMAL.split(' ').map(name=>{const f=run(['functions','describe',name,'--project',process.env.SP_PROJECT,'--region','us-central1','--gen2','--format=json']);return {name,updateTime:f.updateTime,state:f.state};});
fs.writeFileSync(process.env.SP_OUT,JSON.stringify(m,null,2)+'\n');
NODE
fi

[[ -f "$gate_manifest" ]] || { echo 'manifesto da trava ausente' >&2; exit 1; }
for i in "${!recovery[@]}"; do
  json="$(describe_run "${recovery[$i]}")"
  SP_JSON="$json" SP_NAME="${recovery[$i]}" SP_REGIONAL="${regional[$i]}" SP_SOURCE_MANIFEST="$source_manifest" SP_GATE_MANIFEST="$gate_manifest" node - <<'NODE'
const fs=require('fs'),s=JSON.parse(process.env.SP_JSON),src=JSON.parse(fs.readFileSync(process.env.SP_SOURCE_MANIFEST)),gate=JSON.parse(fs.readFileSync(process.env.SP_GATE_MANIFEST));
const expected=src.find(x=>x.name===process.env.SP_REGIONAL&&x.region==='us-east1');
const saved=gate.recovery.find(x=>x.name===process.env.SP_NAME);
const image=s.spec?.template?.spec?.containers?.[0]?.image;
if(!expected||!saved||image!==expected.image||image!==saved.image||s.status?.latestReadyRevisionName!==saved.revision||s.status?.url!==saved.url)process.exit(1);
NODE
  url="$(SP_JSON="$json" node -e 'process.stdout.write(JSON.parse(process.env.SP_JSON).status.url)')"
  probe_no_auth "$url"
  echo "✓ trava recovery ${recovery[$i]}"
done
for name in "${normal[@]}"; do
  SP_JSON="$(describe_fn "$name")" SP_NAME="$name" SP_GATE_MANIFEST="$gate_manifest" node - <<'NODE'
const fs=require('fs'),f=JSON.parse(process.env.SP_JSON),m=JSON.parse(fs.readFileSync(process.env.SP_GATE_MANIFEST));
const saved=m.normal.find(x=>x.name===process.env.SP_NAME);
if(!saved||f.state!=='ACTIVE'||f.buildConfig?.entryPoint!==process.env.SP_NAME||f.updateTime!==saved.updateTime||
  Date.parse(f.updateTime)<Date.parse(m.startedAt))process.exit(1);
NODE
  echo "✓ trava callable $name"
done

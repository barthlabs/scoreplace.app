#!/usr/bin/env bash
# Publica a trava condicional nas portas atuais. Não ativa protocolo em torneio.
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:---check}"
[[ "$mode" == '--deploy' || "$mode" == '--check' || "$mode" == '--refresh' || "$mode" == '--check-live' ]] || exit 2
project=scoreplace-app
region=us-east1
source_manifest=.claude/tmp/operation-regions-manifest-v2.json
gate_manifest="${SP_GATE_MANIFEST:-.claude/tmp/operation-legacy-gate-manifest-v2.json}"
recovery=(assignmatchcourt-run-recovery applymatchresult-run-recovery settournamentpresence-run-recovery presencwo-run-recovery)
regional=(sp-op-court-v2 sp-op-score-v2 sp-op-presence-v2 sp-op-presence-wo-v2)
targets=(assignMatchCourt applyMatchResult setTournamentPresence setTournamentPresenceWithWOSubstitution)
normal=(setTournamentPresence applyMatchResult applyQueuedResult assignMatchCourt setTournamentPresenceWithWOSubstitution endMatchOnCourt)

[[ -z "$(git status --porcelain)" ]] || { echo 'árvore suja' >&2; exit 1; }
if [[ "$mode" == '--check-live' ]]; then
  scripts/deploy-operation-regions.sh --check-v2-live
else
  scripts/deploy-operation-regions.sh --check-v2
fi
[[ -f "$source_manifest" ]] || { echo 'manifesto regional ausente' >&2; exit 1; }
source_commit="$(SP_MANIFEST="$source_manifest" node -e 'const m=require("./"+process.env.SP_MANIFEST);const s=[...new Set(m.map(x=>x.commit))];if(s.length!==1)process.exit(1);process.stdout.write(s[0])')"
if [[ "$mode" != '--check-live' ]]; then
  git diff --quiet "$source_commit" HEAD -- functions functions-autodraw || { echo 'codebase mudou após build regional' >&2; exit 1; }
fi
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

if [[ "$mode" == '--refresh' ]]; then
  [[ -z "${SP_GATE_MANIFEST:-}" ]] || { echo 'manifesto alternativo só permitido no check' >&2; exit 1; }
  [[ -s "$gate_manifest" ]] || { echo 'trava anterior ausente' >&2; exit 1; }
  candidate=.claude/tmp/operation-legacy-gate-manifest-v2.next.json
  backup=.claude/tmp/operation-legacy-gate-manifest-v2.prev.json
  if [[ ! -e "$candidate" ]]; then
    [[ ! -e "$backup" ]] || { echo 'backup anterior existe sem candidato; examine antes de reiniciar' >&2; exit 1; }
    cp "$gate_manifest" "$backup"
    SP_OLD="$backup" SP_RECOVERY="${recovery[*]}" SP_NORMAL="${normal[*]}" node - <<'NODE'
const fs=require('fs'),m=JSON.parse(fs.readFileSync(process.env.SP_OLD));
for(const [key,names] of [['recovery',process.env.SP_RECOVERY.split(' ')],['normal',process.env.SP_NORMAL.split(' ')]]) {
  if(m[key]?.length!==names.length||names.some(n=>!m[key].some(x=>x.name===n)))throw Error('manifesto antigo incompleto: '+key);
}
NODE
    validate_before
    for i in "${!recovery[@]}"; do
      SP_JSON="$(describe_run "${recovery[$i]}")" SP_OLD="$backup" SP_NAME="${recovery[$i]}" node - <<'NODE'
const fs=require('fs'),s=JSON.parse(process.env.SP_JSON),m=JSON.parse(fs.readFileSync(process.env.SP_OLD));
const r=m.recovery.find(x=>x.name===process.env.SP_NAME);
if(s.status?.latestReadyRevisionName!==r.revision||s.status?.url!==r.url||s.spec?.template?.spec?.containers?.[0]?.image!==r.image||s.spec?.template?.metadata?.annotations?.['run.googleapis.com/base-images'])throw Error('recuperação mudou antes do refresh: '+r.name);
NODE
    done
    pre_file="$(mktemp .claude/tmp/legacy-pre.XXXXXX)"
    trap 'rm -f "$pre_file"' EXIT
    printf '[]\n' > "$pre_file"
    for name in "${normal[@]}"; do
      SP_JSON="$(describe_fn "$name")" SP_OLD="$backup" SP_NAME="$name" SP_PRE="$pre_file" node - <<'NODE'
const fs=require('fs'),f=JSON.parse(process.env.SP_JSON),m=JSON.parse(fs.readFileSync(process.env.SP_OLD));
const old=m.normal.find(x=>x.name===process.env.SP_NAME);
if(f.updateTime!==old.updateTime||f.state!=='ACTIVE'||f.buildConfig?.entryPoint!==old.name)throw Error('função normal mudou antes do refresh: '+old.name);
const a=JSON.parse(fs.readFileSync(process.env.SP_PRE));a.push({name:old.name,preUpdateTime:old.updateTime});fs.writeFileSync(process.env.SP_PRE,JSON.stringify(a));
NODE
    done
    started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    SP_STARTED="$started" SP_SOURCE="$source_commit" SP_PRE="$pre_file" SP_OUT="$candidate" node - <<'NODE'
const fs=require('fs');fs.writeFileSync(process.env.SP_OUT,JSON.stringify({startedAt:process.env.SP_STARTED,sourceCommit:process.env.SP_SOURCE,preNormal:JSON.parse(fs.readFileSync(process.env.SP_PRE)),recovery:[],normal:[]},null,2)+'\n');
NODE
    rm -f "$pre_file"
    trap - EXIT
    bash scripts/deploy-functions.sh main --only setTournamentPresence
    bash scripts/deploy-functions.sh autodraw --only applyMatchResult,applyQueuedResult,assignMatchCourt,setTournamentPresenceWithWOSubstitution,endMatchOnCourt
  else
    [[ -s "$backup" ]] || { echo 'candidato órfão sem backup' >&2; exit 1; }
  fi
  SP_NEXT="$candidate" SP_SOURCE="$source_commit" SP_NORMAL="${normal[*]}" node - <<'NODE'
const fs=require('fs'),m=JSON.parse(fs.readFileSync(process.env.SP_NEXT)),names=process.env.SP_NORMAL.split(' ');
if(m.sourceCommit!==process.env.SP_SOURCE||!Number.isFinite(Date.parse(m.startedAt))||m.preNormal?.length!==names.length||names.some(n=>!m.preNormal.some(x=>x.name===n)))throw Error('candidato inválido');
NODE
  for name in "${normal[@]}"; do
    SP_JSON="$(describe_fn "$name")" SP_NAME="$name" SP_NEXT="$candidate" node - <<'NODE'
const fs=require('fs'),f=JSON.parse(process.env.SP_JSON),p=process.env.SP_NEXT,m=JSON.parse(fs.readFileSync(p));
const pre=m.preNormal.find(x=>x.name===process.env.SP_NAME),saved=m.normal.find(x=>x.name===process.env.SP_NAME);
if(f.state!=='ACTIVE'||f.buildConfig?.entryPoint!==process.env.SP_NAME||!pre||f.updateTime===pre.preUpdateTime||Date.parse(f.updateTime)<Date.parse(m.startedAt)||saved&&saved.updateTime!==f.updateTime)throw Error('função normal sem revisão nova válida: '+process.env.SP_NAME);
if(!saved)m.normal.push({name:process.env.SP_NAME,updateTime:f.updateTime,state:f.state});
fs.writeFileSync(p,JSON.stringify(m,null,2)+'\n');
NODE
  done
  for i in "${!recovery[@]}"; do
    name="${recovery[$i]}"
    row="$(SP_MANIFEST="$source_manifest" SP_NAME="${regional[$i]}" node -e 'const m=JSON.parse(require("fs").readFileSync(process.env.SP_MANIFEST));const r=m.find(x=>x.name===process.env.SP_NAME&&x.region==="us-east1");if(!r)process.exit(1);process.stdout.write(JSON.stringify(r))')"
    image="$(SP_ROW="$row" node -e 'process.stdout.write(JSON.parse(process.env.SP_ROW).image)')"
    digest="$(SP_ROW="$row" node -e 'process.stdout.write(JSON.parse(process.env.SP_ROW).sourceDigest)')"
    before="$(describe_run "$name")"
    SP_JSON="$before" SP_NAME="$name" node - <<'NODE'
const s=JSON.parse(process.env.SP_JSON);
if(s.spec?.template?.metadata?.annotations?.['run.googleapis.com/base-images'])throw Error('base image automática: '+process.env.SP_NAME);
NODE
    current_image="$(SP_JSON="$before" node -e 'process.stdout.write(JSON.parse(process.env.SP_JSON).spec.template.spec.containers[0].image)')"
    if [[ "$current_image" != "$image" ]]; then
      gcloud run deploy "$name" --project "$project" --region "$region" --image "$image" \
        --update-env-vars "SP_SOURCE_DIGEST=$digest,SP_OPERATION_REGION=$region" --allow-unauthenticated --quiet
    fi
    after="$(describe_run "$name")"
    SP_JSON="$after" SP_IMAGE="$image" SP_DIGEST="$digest" SP_NAME="$name" SP_NEXT="$candidate" node - <<'NODE'
const fs=require('fs'),s=JSON.parse(process.env.SP_JSON),p=process.env.SP_NEXT,m=JSON.parse(fs.readFileSync(p));
const env=Object.fromEntries((s.spec?.template?.spec?.containers?.[0]?.env||[]).map(x=>[x.name,x.value]));
if(s.spec?.template?.spec?.containers?.[0]?.image!==process.env.SP_IMAGE||env.SP_SOURCE_DIGEST!==process.env.SP_DIGEST||env.SP_OPERATION_REGION!=='us-east1'||!s.status?.latestReadyRevisionName||!s.status?.url||s.spec?.template?.metadata?.annotations?.['run.googleapis.com/base-images'])throw Error('recuperação divergente: '+process.env.SP_NAME);
const row={name:process.env.SP_NAME,image:process.env.SP_IMAGE,revision:s.status.latestReadyRevisionName,url:s.status.url};
const i=m.recovery.findIndex(x=>x.name===row.name);if(i>=0){if(JSON.stringify(m.recovery[i])!==JSON.stringify(row))throw Error('revisão mudou após registro: '+row.name);}else m.recovery.push(row);
fs.writeFileSync(p,JSON.stringify(m,null,2)+'\n');
NODE
    probe_no_auth "$(SP_JSON="$after" node -e 'process.stdout.write(JSON.parse(process.env.SP_JSON).status.url)')"
  done
  SP_NEXT="$candidate" SP_NORMAL="${normal[*]}" SP_RECOVERY="${recovery[*]}" node - <<'NODE'
const fs=require('fs'),m=JSON.parse(fs.readFileSync(process.env.SP_NEXT));
for(const [key,names] of [['normal',process.env.SP_NORMAL.split(' ')],['recovery',process.env.SP_RECOVERY.split(' ')]])if(m[key].length!==names.length||names.some(n=>!m[key].some(x=>x.name===n)))throw Error('candidato incompleto: '+key);
NODE
  SP_GATE_MANIFEST="$candidate" bash "$0" --check
  mv "$candidate" "$gate_manifest"
  echo '✓ trava legada sincronizada com malha regional'
fi

[[ -f "$gate_manifest" ]] || { echo 'manifesto da trava ausente' >&2; exit 1; }
SP_GATE_MANIFEST="$gate_manifest" SP_SOURCE="$source_commit" node - <<'NODE'
const m=JSON.parse(require('fs').readFileSync(process.env.SP_GATE_MANIFEST));if(m.sourceCommit!==process.env.SP_SOURCE)throw Error('sourceCommit da trava divergente');
NODE
for i in "${!recovery[@]}"; do
  json="$(describe_run "${recovery[$i]}")"
  SP_JSON="$json" SP_NAME="${recovery[$i]}" SP_REGIONAL="${regional[$i]}" SP_SOURCE_MANIFEST="$source_manifest" SP_GATE_MANIFEST="$gate_manifest" node - <<'NODE'
const fs=require('fs'),s=JSON.parse(process.env.SP_JSON),src=JSON.parse(fs.readFileSync(process.env.SP_SOURCE_MANIFEST)),gate=JSON.parse(fs.readFileSync(process.env.SP_GATE_MANIFEST));
const expected=src.find(x=>x.name===process.env.SP_REGIONAL&&x.region==='us-east1');
const saved=gate.recovery.find(x=>x.name===process.env.SP_NAME);
const image=s.spec?.template?.spec?.containers?.[0]?.image;
if(!expected||!saved||image!==expected.image||image!==saved.image||s.status?.url!==saved.url||s.spec?.template?.metadata?.annotations?.['run.googleapis.com/base-images'])process.exit(1);
if(s.status?.latestReadyRevisionName!==saved.revision){console.error('revisão da recuperação divergente');process.exit(1);}
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

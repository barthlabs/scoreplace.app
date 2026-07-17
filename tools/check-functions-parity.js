#!/usr/bin/env node
/* Divergência de Cloud Functions: o que está NO AR × o que está no CÓDIGO (main).
 *
 *   npm run cf:check                      # staging vs código  (é o que a CI roda)
 *   npm run cf:check -- --project=scoreplace-app     # prod vs código
 *   npm run cf:check -- --both            # os dois + prod × staging (precisa acesso aos 2)
 *
 * POR QUE EXISTE: o deploy tem que ser por ALVO NOMINAL (functions-autodraw cai no
 * codebase `default`, o mesmo do functions/ — deploy por codebase com --force APAGA as
 * do outro; ver project_autodraw_deploy_footgun). Alvo nominal nunca apaga nada, então
 * função removida do código FICA NO AR pra sempre, invisível. Foi assim que a staging
 * juntou 10 zumbis (whatsappHealthGuard reiniciando o wa.scoreplace.app todo dia, meses
 * depois do canal WhatsApp morrer na v1.2.9). Este check é o que torna isso visível.
 *
 * Sai != 0 quando há divergência → em CI, fica vermelho.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CODEBASES = [
  { dir: 'functions', arquivo: 'index.js' },
  { dir: 'functions-autodraw', arquivo: 'index.js' },
  { dir: 'functions-stripe', arquivo: 'index.js' },
];

const args = process.argv.slice(2);
const BOTH = args.includes('--both');
const projArg = args.find((a) => a.startsWith('--project='));
const PROJETOS = BOTH ? ['scoreplace-app', 'scoreplace-staging']
  : [projArg ? projArg.split('=')[1] : 'scoreplace-staging'];

// ── o que o CÓDIGO define ────────────────────────────────────────────────────
function doCodigo() {
  const set = new Set();
  for (const c of CODEBASES) {
    const p = path.join(ROOT, c.dir, c.arquivo);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    // `exports.nome = ...` (CJS) e `export const nome = ...` (ESM, functions-stripe)
    (src.match(/^exports\.([a-zA-Z0-9_]+)\s*=/gm) || []).forEach((m) => set.add(m.replace(/^exports\./, '').replace(/\s*=.*/, '')));
    (src.match(/^export\s+const\s+([a-zA-Z0-9_]+)\s*=/gm) || []).forEach((m) => set.add(m.replace(/^export\s+const\s+/, '').replace(/\s*=.*/, '')));
  }
  return set;
}

// ── o que está NO AR ─────────────────────────────────────────────────────────
function noAr(projeto) {
  const out = execFileSync('firebase', ['functions:list', '--project', projeto, '--json'], {
    encoding: 'utf8', maxBuffer: 1024 * 1024 * 32,
  });
  const j = JSON.parse(out);
  const lista = (j.result || j.functions || []);
  return new Set(lista.map((f) => f.id || f.functionName || f.name).filter(Boolean)
    .map((n) => String(n).split('/').pop()));
}

// A REGRA (dono): NÃO é igualdade — é **prod ⊆ staging**.
//   _"prod pode estar atras de stag. testamos primeiro as coisas em stag e aprovadas
//    mandamos para prod. o contrario é que nao pode ocorrer, prod ter coisas que stag
//    nao tem."_
// Logo:
//   • staging na frente do código/prod  → OK (é onde se testa).
//   • prod atrás do código              → OK (ainda não promovido).
//   • função em prod que NÃO está na staging → ERRO: prod está rodando algo que nunca
//     foi testado, e um teste na staging não diz nada sobre ele.
//   • staging sem algo que o código tem → ERRO: a staging não está testando o main.
const codigo = doCodigo();
console.log('código (main): ' + codigo.size + ' funções nas 3 codebases\n');

let problemas = 0;
const porProjeto = {};
for (const p of PROJETOS) {
  let ar;
  try { ar = noAr(p); } catch (e) {
    console.error('não consegui listar ' + p + ' (sem acesso?): ' + (e.message || '').split('\n')[0]);
    process.exit(2);
  }
  porProjeto[p] = ar;
  const ehStaging = p.indexOf('staging') !== -1;
  const faltando = [...codigo].filter((f) => !ar.has(f));
  const zumbis = [...ar].filter((f) => !codigo.has(f) && !f.startsWith('ext-'));
  console.log('## ' + p + ' — ' + ar.size + ' no ar');
  if (faltando.length) {
    if (ehStaging) { problemas++; console.log('   ❌ no código mas NÃO na staging (a staging não está testando o main): ' + faltando.join(', ')); }
    else console.log('   ℹ️  no código mas ainda não em prod (não promovido — OK): ' + faltando.join(', '));
  }
  if (zumbis.length) { problemas++; console.log('   🧟 no ar mas NÃO no código (zumbi — apague): ' + zumbis.join(', ')); }
  if (!faltando.length && !zumbis.length) console.log('   ✓ bate com o código');
  console.log('');
}

if (BOTH) {
  const prod = porProjeto['scoreplace-app'];
  const stg = porProjeto['scoreplace-staging'];
  const soProd = [...prod].filter((f) => !stg.has(f) && !f.startsWith('ext-'));
  const soStg = [...stg].filter((f) => !prod.has(f) && !f.startsWith('ext-'));
  console.log('## prod ⊆ staging (prod NUNCA pode ter o que a staging não tem)');
  if (soProd.length) { problemas++; console.log('   ❌ SÓ EM PROD — roda em produção sem existir na staging: ' + soProd.join(', ')); }
  else console.log('   ✓ tudo que roda em prod existe na staging');
  if (soStg.length) console.log('   ℹ️  só na staging (em teste, aguardando promoção — OK): ' + soStg.join(', '));
}

if (problemas) {
  console.log('\n✗ ' + problemas + ' divergência(s). Zumbi some com: firebase functions:delete <nome> --project <proj> --force');
  process.exit(1);
}
console.log('✓ sem divergência');

#!/usr/bin/env node
/* check-runbook-amizade.js — OS COMANDOS DO RUNBOOK EXECUTAM DE VERDADE?
 *
 * ⛔ POR QUE EXISTE (8ª auditoria externa, 29/ago/2026): o cutover mandava rodar
 * `scripts/deploy-functions.sh` — sem argumento. O script exige `main|autodraw|stripe|all`
 * e ABORTA sem ele. Ou seja: a etapa mais importante do procedimento não executava, e isso
 * só se descobriria no meio do corte, com o cliente já congelado.
 * Documentação escrita à mão apodrece. Este gate confere que cada comando crítico do
 * runbook existe, aceita os argumentos mostrados, e que as etapas obrigatórias estão lá.
 *
 * ⚠️ NÃO faz deploy: usa o `--dry-run` que o próprio script oferece.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'CUTOVER-AMIZADE-2.1.48.md');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

const runbook = fs.readFileSync(DOC, 'utf8');

// ── 1. o comando de deploy do runbook é o REAL ──────────────────────────────
const semArg = /^scripts\/deploy-functions\.sh\s*(#.*)?$/m.test(runbook);
ok(!semArg, '⛔ o runbook NÃO manda `deploy-functions.sh` sem argumento (o script aborta assim)');
ok(/scripts\/deploy-functions\.sh main/.test(runbook), 'e usa `deploy-functions.sh main` (o codebase desta leva)');

// ── 2. o comando existe e aceita o argumento ────────────────────────────────
const sh = path.join(ROOT, 'scripts', 'deploy-functions.sh');
ok(fs.existsSync(sh), 'scripts/deploy-functions.sh existe');
const dry = spawnSync('bash', [sh, 'main', '--dry-run'], { cwd: ROOT, encoding: 'utf8' });
ok(dry.status === 0, '`deploy-functions.sh main --dry-run` sai 0 (deu ' + dry.status + ')');
const saida = (dry.stdout || '') + (dry.stderr || '');
['sendFriendRequest', 'acceptFriendRequest', 'rejectFriendRequest', 'cancelFriendRequest',
 'removeFriend', 'listLegacyFriendships', 'mergePhoneAccount', 'deleteAccount',
 'autoMergeOnProfileUpdate', 'scheduledAutoMergeCleanup'].forEach((fn) => {
  ok(saida.indexOf('functions:' + fn) !== -1, '  o deploy alveja `' + fn + '`');
});

// ── 3. os demais scripts citados existem e aceitam o que o runbook mostra ────
const citados = [
  ['scripts/check-nativo-pronto-para-corte.js', null],
  ['scripts/backup-amizade-legado.js', null],
  ['scripts/restore-amizade-legado.js', null],
  ['scripts/backfill-amizade.js', null],
];
citados.forEach(([rel]) => {
  ok(fs.existsSync(path.join(ROOT, rel)), rel + ' existe');
  ok(runbook.indexOf(rel) !== -1, 'e é citado no runbook');
});

// flags que o runbook mostra têm que existir no script
const bkf = fs.readFileSync(path.join(ROOT, 'scripts', 'backfill-amizade.js'), 'utf8');
[['--fase=', "startsWith('--fase=')"],
 ['--aplicar', "includes('--aplicar')"],
 ['--adjudicacao=', "startsWith('--adjudicacao=')"],
 ['--apagar-stale', "includes('--apagar-stale')"],
 ['--maintenance=', "startsWith('--maintenance=')"],
 ['--preflight-primeiro-corte', "includes('--preflight-primeiro-corte')"]].forEach(([flag, sinal]) => {
  ok(bkf.indexOf(sinal) !== -1, 'o backfill implementa `' + flag + '`');
  ok(runbook.indexOf(flag) !== -1, 'e o runbook o usa');
});
const bkp = fs.readFileSync(path.join(ROOT, 'scripts', 'backup-amizade-legado.js'), 'utf8');
ok(bkp.indexOf("startsWith('--saida=')") !== -1, 'o backup implementa `--saida=`');

// ── 4. as etapas obrigatórias estão no runbook ──────────────────────────────
[['deploy das Functions', /deploy-functions\.sh main/],
 ['Rules da Etapa A', /firestore\.rules\.etapaA/],
 ['mudança de fase', /--fase=frozen --aplicar/],
 ['backup', /backup-amizade-legado\.js/],
 ['backfill', /backfill-amizade\.js --aplicar/],
 ['Rules finais', /firestore\.rules\.final/],
 ['Hosting', /deploy-hosting\.sh/],
 ['marcar live', /--fase=live --aplicar/],
 ['manutenção/rollback', /--maintenance=on --aplicar/],
 ['pre-flight do marcador', /--preflight-primeiro-corte/],
].forEach(([nome, re]) => ok(re.test(runbook), 'o runbook cobre: ' + nome));

// ── 5. o runbook deixa claro que `backfilled` continua bloqueado ────────────
ok(/`backfilled` NÃO libera nada/.test(runbook) || /backfilled.*recusadas/.test(runbook),
  'o runbook diz que `backfilled` NÃO libera operações');
const iLive = runbook.lastIndexOf('--fase=live --aplicar');
const iHosting = runbook.lastIndexOf('deploy-hosting.sh');
ok(iLive > iHosting, '⛔ e `--fase=live` é o ÚLTIMO passo (depois do Hosting)');

// ── 6. contrato de retorno da varredura (ponto 7) ───────────────────────────
const idxSrc = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
const iScan = idxSrc.indexOf('async function _scanAndMergeByField');
const corpoScan = idxSrc.slice(iScan, idxSrc.indexOf('\nasync function ', iScan + 10));
ok(!/return \{ pulado: true/.test(corpoScan),
  '⛔ `_scanAndMergeByField` NÃO devolve objeto quando congelado (o caller faz .length)');
ok(/return \[\];/.test(corpoScan), 'e devolve ARRAY, como nas demais saídas');

// ── 7. UMA aquisição `deleting` em deleteAccount (10ª auditoria, ponto 1) ───
/* Uma segunda aquisição do mesmo lock fazia o CAMINHO FELIZ travar contra si mesmo, depois
 * de já ter apagado torneios. Regex é gate ADICIONAL aqui — a prova funcional está em
 * tests/amizade/delete-happy-path.test.js. */
const _iDel = idxSrc.indexOf('exports.deleteAccount = onCall');
const _corpoDel = idxSrc.slice(_iDel, idxSrc.indexOf('\n);', _iDel));
const _nAdq = (_corpoDel.match(/adquirir\(db, \[uid\], "deleting"\)/g) || []).length;
ok(_nAdq === 1, '⛔ deleteAccount tem EXATAMENTE 1 aquisição `deleting` (achou ' + _nAdq + ')');
const _nFase = (_corpoDel.match(/exigirLiberado/g) || []).length;
ok(_nFase === 1, '⛔ e EXATAMENTE 1 checagem de fase (achou ' + _nFase + ')');
ok((_corpoDel.match(/let _posseDel/g) || []).length === 1, 'e uma única posse');

// ── 8. as Rules da Etapa A vêm ANTES do drain (ponto 5) ────────────────────
const _iRules = runbook.indexOf('cp firestore.rules.etapaA firestore.rules');
const _iDrain = runbook.indexOf('sleep 600');
ok(_iRules > 0 && _iDrain > _iRules,
  '⛔ o cutover fecha as Rules da Etapa A ANTES do período de drain');
ok(/Rules não\s*\n?interferem nas invocações Admin/.test(runbook) || /Rules não interferem nas invocações Admin/.test(runbook),
  'e explica por que isso é seguro');

if (fail) { console.error('\n' + fail + ' problema(s) no runbook.'); process.exit(1); }
console.log('✓ runbook: ' + pass + ' verificações — os comandos existem e executam');

// test-parity-old-vs-new.js — o novo REPRODUZ o código antigo, testado e aprovado?
//
// Pedido do dono (jul/2026): _"é só garantir que o código antigo esteja reproduzido nessas
// soluções de problemas de números de inscritos/presentes."_
//
// Garantir é palavra. Isto é medida: carrega as funções da **v1.2.24** direto do git (a
// versão que está em produção e que o dono testou e ajustou), roda o MESMO cenário pelos
// dois lados e compara o ELENCO resultante — entrada por entrada, por uid.
//
// Escopo: as decisões DETERMINÍSTICAS. As de sorteio livre ('random') usam Math.random de
// propósito e não são comparáveis — dois runs do MESMO lado já divergem; o que se compara
// nelas é a CONTAGEM (quantos saíram), que também está aqui.
//
// Se o novo divergir do antigo em qualquer célula, fica VERMELHO e diz qual.
//
// node test-parity-old-vs-new.js

const { execFileSync } = require('child_process');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..');
const OLD_REF = '37f60d12'; // v1.2.24 — a versão em produção, testada e aprovada pelo dono

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name + (got !== undefined ? ' — ' + got : '')); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' — ' + got : '')); }
}
const gitShow = (file) => execFileSync('git', ['show', `${OLD_REF}:${file}`], { cwd: REPO, maxBuffer: 64e6 }).toString();

// ── LADO NOVO ───────────────────────────────────────────────────────────────
const NEW = require('./draw-core.js')._window;

// ── LADO ANTIGO — as funções da v1.2.24, carregadas do git num sandbox próprio ─
// Mesmo shim do draw-core (window=global) + identity-core da época. Nada é reescrito
// aqui: é o arquivo do commit, avaliado como está.
const OLDW = {};
const sandbox = { window: OLDW, console, Math, JSON, Object, Array, String, Number, Date, parseInt, parseFloat };
sandbox.global = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const runOld = (file) => vm.runInContext(gitShow(file), sandbox, { filename: 'OLD:' + file });
const runDisk = (file) => vm.runInContext(require('fs').readFileSync(path.join(REPO, file), 'utf8'), sandbox, { filename: 'DISK:' + file });
// PRIMITIVAS DE IDENTIDADE: iguais nos dois lados, de propósito.
// `identity-core.js` não existe na v1.2.24 — lá esses helpers moram no store.js, que não
// carrega em Node (toca document no load). A extração pro identity-core foi MUDANÇA DE CASA,
// não de comportamento. Dar a MESMA base pros dois lados isola exatamente o que está em
// julgamento: as funções de DECISÃO (resto / pow2 / sem-dupla / ausentes / chamada).
runDisk('js/views/identity-core.js');
runDisk('js/views/tournaments-utils.js');
OLDW._t = (k) => k; OLDW._warn = () => {}; OLDW._log = () => {}; OLDW._error = () => {};
OLDW._pName = (p, fb) => {
  if (!p) return fb || '';
  if (typeof p === 'string') return p;
  if (p.p1Name && p.p2Name) return p.p1Name + ' / ' + p.p2Name;
  return p.displayName || p.name || fb || '';
};
OLDW._nameForUid = () => '';
runOld('js/views/tournaments-draw.js');       // _isManualPairing, _formDoublesTeams…
runOld('js/views/tournaments-draw-prep.js');  // checkPowerOf2, _diagnoseAll, _soloMoveOut, _listSoloEntries…
// Na v1.2.24 os movedores de elenco (_autoMoveSoloToWaitlist / _autoMoveAbsentToStandby /
// _isParticipantPresent / _moveAbsentToWaitlistForPresentDraw) moravam no tournaments.js —
// e são justamente eles que estão em julgamento (foram movidos pro draw-decisions.js).
// Carregar o arquivo inteiro NÃO os define: lá eles ficam DENTRO de `renderTournaments`
// (só passam a existir depois que a view roda). Então avaliamos o TEXTO do bloco, do
// commit, no topo do sandbox. É o mesmo código, sem uma vírgula mudada.
{
  const OLD_SRC_T = gitShow('js/views/tournaments.js');
  const i = OLD_SRC_T.indexOf('window._autoMoveSoloToWaitlist = function(t) {');
  const endMark = 'return notPresent.length;';
  const j = OLD_SRC_T.indexOf(endMark, i);
  if (i < 0 || j < 0) throw new Error('não achei o bloco de movedores na v1.2.24');
  const block = OLD_SRC_T.slice(i, OLD_SRC_T.indexOf('};', j) + 2);
  vm.runInContext(block, sandbox, { filename: 'OLD:movers' });
}
// `_executeRemoval`/`_confirmP2Resolution` da v1.2.24 tocam DOM/save — o que se compara é o
// NÚCLEO deles, então recriamos AQUI só o trecho de conta, copiado LITERALMENTE do commit
// (não é reimplementação: é o mesmo texto, sem as linhas de UI).
const OLD_SRC_PREP = gitShow('js/views/tournaments-draw-prep.js');
function sliceOld(startMark, endMark, label) {
  const i = OLD_SRC_PREP.indexOf(startMark);
  const j = OLD_SRC_PREP.indexOf(endMark, i);
  if (i < 0 || j < 0) throw new Error('não achei o trecho antigo: ' + label);
  return OLD_SRC_PREP.slice(i, j);
}
// núcleo do _executeRemoval antigo (da 1ª linha de conta até antes do log)
vm.runInContext(
  'window._OLD_remainder = function(t, mode, method) {\n' +
  sliceOld("var arr = Array.isArray(t.participants) ? t.participants.slice() : [];",
           "// Log to history", '_executeRemoval') +
  '\n return { removed: removed, count: removed.length };\n};', sandbox);
// núcleo do _confirmP2Resolution antigo (standby) — os radios viram argumento
vm.runInContext(
  'window._OLD_p2standby = function(t, standbyPick) {\n' +
  '  var info = window.checkPowerOf2(t);\n' +
  sliceOld("        t.p2Resolution = 'standby';", "        const modeRadio", '_confirmP2Resolution')
    .replace(/const pickRadio[\s\S]*?standbyPick = pickRadio \? pickRadio\.value : 'last';/, '')
    .replace(/\bconst\b/g, 'var').replace(/\blet\b/g, 'var') +
  '\n  return { moved: standbyOverflow.length };\n};', sandbox);

// ── Utilitários de comparação — SEMPRE por uid ──────────────────────────────
const keyOf = (p) => {
  const u = NEW._participantUids(p);
  return u.length ? 'uid:' + u.slice().sort().join('+') : 'fic:' + String((p && (p.displayName || p.name)) || '').toLowerCase();
};
const rosterKey = (arr) => (arr || []).map(keyOf).join(' , ');
const clone = (o) => JSON.parse(JSON.stringify(o));

// Fixtures HIDRATADOS (com nome) — é o estado em que o código ANTIGO rodava no cliente.
// É a comparação justa: se o novo diverge AQUI, ele mudou comportamento aprovado.
function mkSolos(n, extra) {
  const parts = [];
  for (let i = 1; i <= n; i++) parts.push({ uid: 'u' + i, displayName: 'J' + i, name: 'J' + i });
  return Object.assign({ id: 't', status: 'closed', sport: 'Beach Tennis', participants: parts,
    waitlist: [], standbyParticipants: [], checkedIn: {}, absent: {}, teamOrigins: {}, vips: {} }, extra || {});
}
function mkPairs(nPairs, nSolos) {
  const parts = [];
  for (let i = 1; i <= nPairs; i++) parts.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i,
    displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i });
  for (let i = 1; i <= (nSolos || 0); i++) parts.push({ uid: 's' + i, displayName: 'S' + i, name: 'S' + i });
  return { id: 't', status: 'closed', sport: 'Beach Tennis', enrollmentMode: 'time', teamSize: 2,
    participants: parts, waitlist: [], standbyParticipants: [], checkedIn: {}, absent: {}, teamOrigins: {}, vips: {} };
}

console.log('\n═══ PARIDADE: v1.2.24 (produção, aprovada) × novo ═══\n');

// ── 1. RESTO — método "últimos inscritos" (determinístico) ───────────────────
console.log('RESTO · método "últimos inscritos" (individual e duplas):');
[5, 7, 9, 11, 13, 17, 19, 23, 31, 35].forEach((n) => {
  ['standby', 'exclusion'].forEach((mode) => {
    const A = mkSolos(n, { enrollmentMode: 'time', teamSize: 2 });
    const B = clone(A);
    OLDW._OLD_remainder(A, mode, 'last');
    NEW._applyRemainderRemoval(B, mode, 'last');
    ok(`${n} inscritos · ${mode}`, rosterKey(A.participants) === rosterKey(B.participants) &&
       rosterKey(A.waitlist) === rosterKey(B.waitlist),
       'elenco ' + A.participants.length + '↔' + B.participants.length +
       ' | espera ' + (A.waitlist || []).length + '↔' + (B.waitlist || []).length);
  });
});

// ── 2. RESTO — "sorteio geral" (random): compara a CONTAGEM ──────────────────
console.log('\nRESTO · método "sorteio geral" (random → compara contagem):');
[7, 13, 19, 35].forEach((n) => {
  const A = mkSolos(n, { enrollmentMode: 'time', teamSize: 2 });
  const B = clone(A);
  const rA = OLDW._OLD_remainder(A, 'standby', 'random');
  const rB = NEW._applyRemainderRemoval(B, 'standby', 'random');
  ok(`${n} inscritos · mesma quantidade removida`, rA.count === rB.removed.length &&
     A.participants.length === B.participants.length,
     'removidos ' + rA.count + '↔' + rB.removed.length);
});

// ── 3. POW2 · lista de espera, "últimos a se inscrever" ─────────────────────
console.log('\nPOTÊNCIA DE 2 · espera, "últimos a se inscrever":');
[3, 5, 6, 7, 9, 12, 17, 20].forEach((n) => {
  const A = mkSolos(n);
  const B = clone(A);
  OLDW._OLD_p2standby(A, 'last');
  NEW._applyP2Resolution(B, 'standby', { pick: 'last', mode: 'teams' });
  ok(`${n} inscritos`, rosterKey(A.participants) === rosterKey(B.participants) &&
     rosterKey(A.standbyParticipants) === rosterKey(B.standbyParticipants) &&
     A.p2TargetCount === B.p2TargetCount,
     'chave ' + A.participants.length + '↔' + B.participants.length +
     ' | espera ' + A.standbyParticipants.length + '↔' + B.standbyParticipants.length +
     ' | alvo ' + A.p2TargetCount + '↔' + B.p2TargetCount);
});

// ── 4. POW2 · espera com VIP protegido ──────────────────────────────────────
console.log('\nPOTÊNCIA DE 2 · espera com VIP (VIP nunca vai pra espera):');
[5, 7, 11].forEach((n) => {
  const A = mkSolos(n); A.vips = { u1: true, u2: true };
  const B = clone(A);
  OLDW._OLD_p2standby(A, 'last');
  NEW._applyP2Resolution(B, 'standby', { pick: 'last', mode: 'teams' });
  ok(`${n} inscritos, 2 VIPs`, rosterKey(A.participants) === rosterKey(B.participants) &&
     rosterKey(A.standbyParticipants) === rosterKey(B.standbyParticipants),
     'chave ' + A.participants.length + '↔' + B.participants.length);
});

// ── 5. POW2 · duplas pré-formadas ───────────────────────────────────────────
console.log('\nPOTÊNCIA DE 2 · duplas pré-formadas:');
[3, 5, 6, 7, 9, 12].forEach((np) => {
  const A = mkPairs(np, 0);
  const B = clone(A);
  OLDW._OLD_p2standby(A, 'last');
  NEW._applyP2Resolution(B, 'standby', { pick: 'last', mode: 'teams' });
  ok(`${np} duplas`, rosterKey(A.participants) === rosterKey(B.participants) &&
     rosterKey(A.standbyParticipants) === rosterKey(B.standbyParticipants),
     'chave ' + A.participants.length + '↔' + B.participants.length);
});

// ── 6. SEM-DUPLA · avulsos → espera / exclusão ──────────────────────────────
console.log('\nSEM-DUPLA · avulsos → espera e exclusão:');
[[16, 3], [8, 1], [4, 5], [2, 2]].forEach(([np, ns]) => {
  [true, false].forEach((toWaitlist) => {
    const A = mkPairs(np, ns);
    const B = clone(A);
    OLDW._soloMoveOut(A, toWaitlist);
    NEW._soloMoveOut(B, toWaitlist);
    ok(`${np} duplas + ${ns} sem dupla · ${toWaitlist ? 'espera' : 'exclusão'}`,
       rosterKey(A.participants) === rosterKey(B.participants) &&
       rosterKey(A.waitlist) === rosterKey(B.waitlist),
       'elenco ' + A.participants.length + '↔' + B.participants.length +
       ' | espera ' + A.waitlist.length + '↔' + B.waitlist.length);
  });
});

// ── 7. AUSENTES → standby ───────────────────────────────────────────────────
console.log('\nAUSENTES → lista de espera (W.O. pré-sorteio):');
[[10, ['u2', 'u5']], [16, ['u1']], [8, ['u3', 'u4', 'u8']]].forEach(([n, absent]) => {
  const A = mkSolos(n); absent.forEach((u) => { A.absent[u] = 1; });
  const B = clone(A);
  const mA = OLDW._autoMoveAbsentToStandby(A);
  const mB = NEW._autoMoveAbsentToStandby(B);
  ok(`${n} inscritos, ${absent.length} ausente(s)`, mA === mB &&
     rosterKey(A.participants) === rosterKey(B.participants) &&
     rosterKey(A.standbyParticipants) === rosterKey(B.standbyParticipants),
     'moveu ' + mA + '↔' + mB + ' | elenco ' + A.participants.length + '↔' + B.participants.length);
});

// ── 8. CHAMADA · presentes × ausentes (o cenário "16 inscritos, 10 vieram") ──
console.log('\nCHAMADA pré-sorteio · sortear entre os presentes:');
[[16, 10], [8, 5], [12, 12], [10, 0]].forEach(([n, presentes]) => {
  const A = mkSolos(n);
  for (let i = 1; i <= presentes; i++) A.checkedIn['u' + i] = 1;
  const B = clone(A);
  const mA = OLDW._moveAbsentToWaitlistForPresentDraw(A);
  const mB = NEW._moveAbsentToWaitlistForPresentDraw(B);
  ok(`${n} inscritos, ${presentes} presentes`, mA === mB &&
     rosterKey(A.participants) === rosterKey(B.participants) &&
     rosterKey(A.waitlist) === rosterKey(B.waitlist),
     'na chave ' + A.participants.length + '↔' + B.participants.length +
     ' | espera ' + A.waitlist.length + '↔' + B.waitlist.length);
});

// ── 9. DIAGNÓSTICO · o mesmo veredito dos dois lados ─────────────────────────
console.log('\nDIAGNÓSTICO (_diagnoseAll / checkPowerOf2) — mesmo veredito:');
[5, 7, 8, 16, 19, 35].forEach((n) => {
  [1, 2].forEach((ts) => {
    const t = mkSolos(n, ts === 2 ? { enrollmentMode: 'time', teamSize: 2 } : {});
    const a = OLDW._diagnoseAll(clone(t)), b = NEW._diagnoseAll(clone(t));
    ok(`${n} inscritos · teamSize ${ts}`,
       a.effectiveTeams === b.effectiveTeams && a.remainder === b.remainder &&
       a.isPowerOf2 === b.isPowerOf2 && a.loP2 === b.loP2 && a.hiP2 === b.hiP2 &&
       a.totalPeople === b.totalPeople && a.hasIssues === b.hasIssues,
       'times ' + a.effectiveTeams + '↔' + b.effectiveTeams + ' | resto ' + a.remainder + '↔' + b.remainder);
  });
});

console.log('\n' + (fail === 0 ? '✅' : '❌') + ` ${pass} células iguais, ${fail} divergentes\n`);
process.exit(fail === 0 ? 0 : 1);

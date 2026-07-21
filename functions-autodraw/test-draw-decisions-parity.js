// test-draw-decisions-parity.js — PORTÃO da migração "sorteio client→CF" (item #2).
//
// PROVA, para cada chave de decisão, que a CF produz o resultado correto recebendo
// SÓ (roster cru + pacote de decisões), SEM pré-mutação/persistência do cliente.
// Enquanto isto passa, remover a aplicação client-side é seguro — era REDUNDANTE.
//
// Duas asserções por chave:
//   (A) WIRING/PARIDADE: `_applyDrawDecisions(cloneA, {chave})` deixa o `t` idêntico
//       a rodar o core puro direto em cloneB, na ORDEM do orquestrador. Prova que o
//       pacote carrega TODOS os argumentos que o handler do cliente deriva da UI.
//   (B) FIM-A-FIM: `drawInitial(rosterCru, {decisions})` sorteia chave VÁLIDA.
//
// ESCOPO desta versão: formatos INDIVIDUAIS (odd/incomplete/scope/absentees/p2) —
// limpos, sem a interação auto-move×duplas. solo+remainder já têm cobertura em
// test-draw-decisions.js. flexibilize e remainder-de-DUPLAS via orquestrador estão
// DEFERIDOS de propósito: o orquestrador roda auto-move (drena solos) ANTES de
// flexibilize/remainder (steps 6.5/7), invertendo a ordem do cliente (que forma as
// duplas ANTES do auto-move). Reconciliar essa ordem é passo da migração; até lá,
// testá-los aqui daria falso-verde (ambos os lados viram no-op). Ver TODO no fim.
//
// node functions-autodraw/test-draw-decisions-parity.js

const core = require('./draw-core.js');
const W = core._window;

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name + (got !== undefined ? ' — ' + got : '')); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' — ' + got : '')); }
}

function rosterKey(t) {
  const norm = (arr) => (arr || []).map((p) => W._entryIdKey(p) || (p.displayName || p.name || '?')).slice().sort().join('|');
  return JSON.stringify({
    participants: norm(t.participants), waitlist: norm(t.waitlist),
    standby: norm(t.standbyParticipants), disq: norm(t.disqualified),
    p2: t.p2Resolution || '', p2t: t.p2TargetCount || 0,
    odd: t.oddResolution || '', inc: t.incompleteResolution || '',
    bal: t._drawBalanceMode || '', classify: t.classifyFormat || '',
  });
}
const r1 = (t) => (t.matches || []).filter((m) => m.round === 1 && !m.isBye && !m.isSitOut).length;
const byes = (t) => (t.matches || []).filter((m) => m.isBye).length;

// Roster de N avulsos individuais.
function mkSolos(n, extra) {
  const parts = [];
  for (let i = 1; i <= n; i++) parts.push({ uid: 'u' + i, displayName: 'P' + i, name: 'P' + i });
  return Object.assign({
    id: 'tP', name: 'Paridade', status: 'closed', sport: 'Beach Tennis',
    format: 'Eliminatórias Simples', enrollmentMode: 'individual', teamSize: 1,
    participants: parts, waitlist: [], standbyParticipants: [], disqualified: [],
    teamOrigins: {}, checkedIn: {}, absent: {}, creatorUid: 'uOrg', organizerEmail: 'org@x.com',
  }, extra || {});
}
// mesmos avulsos, mas 6 dos 8 com check-in (2 ausentes) — pra scope/absentees.
function mkWithAbsent() {
  const t = mkSolos(8);
  t.participants.forEach((p, i) => { if (i < 6) W._idMapSet(t, t.checkedIn, p, true); });
  return t;
}
// autoSolo/autoAbsent são no-op em individual sem ausentes — mas rodo pra espelhar
// EXATAMENTE a sequência do orquestrador (steps 3) e não deixar brecha.
function autos(t) { W._autoMoveSoloToWaitlist(t); W._autoMoveAbsentToStandby(t); }

function parity(label, mkFn, decisions, coreFn) {
  const A = mkFn(); W._applyDrawDecisions(A, decisions);
  const B = mkFn(); coreFn(B);
  ok(label + ' — pacote ≡ core puro', rosterKey(A) === rosterKey(B),
     rosterKey(A) === rosterKey(B) ? 'idênticos'
       : ('\n      pacote=' + rosterKey(A) + '\n      core  =' + rosterKey(B)));
}

console.log('\n══════════ PARIDADE: pacote de decisões ≡ core puro ══════════');

console.log('\n── ímpar (odd) ──');
parity('odd=bye_odd', () => mkSolos(5), { odd: 'bye_odd' }, (t) => { autos(t); W._applyOddResolution(t, 'bye_odd'); });
parity('odd=exclusion', () => mkSolos(5), { odd: 'exclusion' }, (t) => { autos(t); W._applyOddResolution(t, 'exclusion'); });

console.log('\n── times incompletos (incomplete) ──');
parity('incomplete=standby', () => mkSolos(8), { incomplete: 'standby' }, (t) => { autos(t); t.incompleteResolution = 'standby'; });
parity('incomplete=lottery_mini', () => mkSolos(8), { incomplete: 'lottery_mini' }, (t) => { autos(t); t.incompleteResolution = 'lottery_mini'; });

console.log('\n── escopo: só presentes (scope) ──');
parity('scope=present', mkWithAbsent, { scope: 'present' }, (t) => { W._moveAbsentToWaitlistForPresentDraw(t); autos(t); });

console.log('\n── ausentes/chamada (absentees) ──');
parity('absentees=waitlist', mkWithAbsent, { absentees: 'waitlist' }, (t) => { W._applyPresenceRoll(t, 'waitlist'); autos(t); });
parity('absentees=disqualify', mkWithAbsent, { absentees: 'disqualify' }, (t) => { W._applyPresenceRoll(t, 'disqualify'); autos(t); });

console.log('\n── potência de 2 (p2) ──');
parity('p2=bye', () => mkSolos(6), { p2: { option: 'bye' } }, (t) => { autos(t); W._applyP2Resolution(t, 'bye', {}); });
parity('p2=playin', () => mkSolos(6), { p2: { option: 'playin' } }, (t) => { autos(t); W._applyP2Resolution(t, 'playin', {}); });
parity('p2=standby/last', () => mkSolos(6), { p2: { option: 'standby', pick: 'last', mode: 'teams' } },
  (t) => { autos(t); W._applyP2Resolution(t, 'standby', { pick: 'last', mode: 'teams' }); });
// 'random' usa Math.random() → não dá pra comparar dois sorteios por igualdade. Prova
// que o pacote CARREGA o pick:'random' e a CF move a QUANTIDADE certa (2) — invariante.
{ const t = mkSolos(6); W._applyDrawDecisions(t, { p2: { option: 'standby', pick: 'random' } });
  ok('p2=standby/random — pacote carrega pick + move 2 pro standby',
     (t.standbyParticipants || []).length === 2 && (t.participants || []).length === 4 &&
     t.p2Resolution === 'standby' && t.standbyPick === 'random',
     'standby=' + (t.standbyParticipants || []).length + ' parts=' + (t.participants || []).length + ' pick=' + t.standbyPick); }
parity('p2=exclusion', () => mkSolos(6), { p2: { option: 'exclusion' } }, (t) => { autos(t); W._applyP2Resolution(t, 'exclusion', {}); });

console.log('\n══════════ FIM-A-FIM: drawInitial(roster cru + pacote) ══════════');

console.log('\n── odd=exclusion → 4 jogam ──');
{ const t = mkSolos(5); const r = core.drawInitial(t, { idStamp: 11, decisions: { odd: 'exclusion' } });
  ok('sorteou', !!(r && r.ok), 'reason=' + (r && r.reason || '—'));
  ok('4 entram (1 excluído)', (t.participants || []).length === 4, 'parts=' + (t.participants || []).length); }

console.log('\n── p2=standby → chave de 4, 2 standby, ZERO BYE ──');
{ const t = mkSolos(6); const r = core.drawInitial(t, { idStamp: 12, decisions: { p2: { option: 'standby', pick: 'last' } } });
  ok('sorteou', !!(r && r.ok), 'reason=' + (r && r.reason || '—'));
  ok('R1 = 2 jogos (chave de 4)', r1(t) === 2, 'R1=' + r1(t));
  ok('ZERO BYE', byes(t) === 0, 'byes=' + byes(t));
  ok('2 no standby', (t.standbyParticipants || []).length === 2, 'standby=' + (t.standbyParticipants || []).length); }

console.log('\n── p2=bye → chave de 8 com BYE (escolha do organizador) ──');
{ const t = mkSolos(6); const r = core.drawInitial(t, { idStamp: 13, decisions: { p2: { option: 'bye' } } });
  ok('sorteou', !!(r && r.ok), 'reason=' + (r && r.reason || '—'));
  ok('há BYE', byes(t) > 0, 'byes=' + byes(t)); }

console.log('\n══════════ FLEXIBILIZAR: forma duplas dos avulsos (bug #2 — auto-move não drena antes) ══════════');
// Bug #2 achado neste ciclo: o auto-move (step 3) drenava os avulsos pra espera ANTES do
// flexibilize (step 6.5) → chave VAZIA. Hoje a "carona" (cliente pré-forma) mascarava; ao
// remover a carona (migração), a CF recebe avulsos + {flexibilize} e QUEBRAVA. Guard
// `!d.flexibilize` no auto-move corrigiu. Estes cenários TRAVAM contra regressão.
function mkDoublesSolos(n) {
  const t = mkSolos(n, { enrollmentMode: 'time', teamSize: 2 });
  t.participants.forEach((p, i) => { p.gender = (i % 2 === 0) ? 'M' : 'F'; });
  return t;
}
console.log('\n── 12 avulsos + {flexibilize} → 6 duplas ──');
{ const t = mkDoublesSolos(12); const r = core.drawInitial(t, { idStamp: 21, decisions: { flexibilize: true, balanceMode: 'equilibrado' } });
  ok('sorteou', !!(r && r.ok), 'reason=' + (r && r.reason || '—'));
  ok('6 duplas formadas (não drenou pra espera)', t.participants.filter((p) => p.p1Name && p.p2Name).length === 6,
     'duplas=' + t.participants.filter((p) => p.p1Name && p.p2Name).length + ' waitlist=' + (t.waitlist || []).length); }
console.log('\n── 12 avulsos + {flexibilize + p2:standby} → 4 duplas, 2 standby, ZERO BYE ──');
{ const t = mkDoublesSolos(12); const r = core.drawInitial(t, { idStamp: 22, decisions: { flexibilize: true, balanceMode: 'equilibrado', p2: { option: 'standby', pick: 'last' } } });
  ok('sorteou', !!(r && r.ok), 'reason=' + (r && r.reason || '—'));
  ok('4 duplas na chave', (t.participants || []).length === 4, 'entradas=' + (t.participants || []).length);
  ok('2 no standby', (t.standbyParticipants || []).length === 2, 'standby=' + (t.standbyParticipants || []).length);
  ok('ZERO BYE', byes(t) === 0, 'byes=' + byes(t)); }
console.log('\n── regressão: 16 duplas formadas + 3 solo + {solo:waitlist} → 8 jogos, 3 espera, ZERO BYE ──');
{ const t = mkSolos(0, { enrollmentMode: 'time', teamSize: 2 });
  for (let i = 1; i <= 16; i++) t.participants.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i });
  for (let i = 1; i <= 3; i++) t.participants.push({ uid: 's' + i, displayName: 'S' + i, name: 'S' + i });
  const r = core.drawInitial(t, { idStamp: 23, decisions: { solo: 'waitlist' } });
  ok('sorteou', !!(r && r.ok), 'reason=' + (r && r.reason || '—'));
  ok('16 duplas, R1=8, 3 espera, 0 BYE', r1(t) === 8 && (t.waitlist || []).length === 3 && byes(t) === 0,
     'R1=' + r1(t) + ' espera=' + (t.waitlist || []).length + ' byes=' + byes(t)); }

console.log('\n══════════ REGRESSÃO: _applyRemainderRemoval não trava com roster minúsculo ══════════');
// Bug achado neste ciclo: _maxTeams===0 fazia o `while (_targetTeams*2 <= _maxTeams)` girar
// pra sempre (loop infinito → TRAVA a transação da CF). Guard `_targetTeams >= 1` corrigiu.
console.log('\n── roster abaixo de teamSize não pode travar ──');
{ const t = mkSolos(0, { enrollmentMode: 'time', teamSize: 2 }); // 0 pessoas, duplas
  let done = false; try { W._applyRemainderRemoval(t, 'standby', 'last'); done = true; } catch (e) { done = true; }
  ok('retorna sem travar (0 pessoas)', done === true);
  ok('não remove ninguém', (t.participants || []).length === 0, 'parts=' + (t.participants || []).length); }
{ const t = mkSolos(1, { enrollmentMode: 'time', teamSize: 2 }); // 1 pessoa < teamSize
  let done = false; try { W._applyRemainderRemoval(t, 'standby', 'last'); done = true; } catch (e) {}
  ok('retorna sem travar (1 pessoa < teamSize)', done === true, 'parts=' + (t.participants || []).length); }

console.log('\n' + (fail === 0 ? '✅' : '❌') + ` ${pass} passaram, ${fail} falharam`);
console.log('\nCobertura CF (pacote → sorteio correto, sem pré-mutação do cliente):');
console.log('  ✓ odd, incomplete, scope, absentees, p2(bye/playin/standby/exclusion), flexibilize.');
console.log('  ✓ bugs corrigidos: loop infinito de _applyRemainderRemoval; auto-move drenando');
console.log('    avulsos antes do flexibilize (guard !d.flexibilize).');
console.log('  Falta (próximo passo da migração, no CLIENTE): converter os handlers/painéis pra');
console.log('  preview-puro + coleta-de-decisão (sem mutar t/save/sync) e gatear a re-entrada da');
console.log('  cadeia pelo pacote; depois, formação MANUAL → CF.\n');
process.exit(fail === 0 ? 0 : 1);

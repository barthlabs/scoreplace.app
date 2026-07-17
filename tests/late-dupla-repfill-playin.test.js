// GAP (dono, 17/jul, torneio REAL tour_1783511910924): Eliminatória Simples PLAYIN, 9 duplas.
// JOGO 5 = "Kelly Barth / Rodrigo Barth VS A definir" (repGame; o p2 tem repFill rank 3 = 4º
// melhor derrotado). Ao formar 1 dupla na lista de espera, ela DEVE entrar no lugar do repescado
// → Kelly/Rodrigo vs dupla-nova, e sobra 1 repescado a menos (5 vencedores + 3 repescados = 8).
//
// Dirige contra a ESTRUTURA REAL (fixture salvo do Firestore de staging), não um mock. Forma a
// dupla como o painel faz (_formLateJoinDupla) e roda _fillRepFillWithLateDuplas.
// Ver [[project_late_dupla_fills_awaiting_slot]].
const fs = require('fs');
const path = require('path');
const { window: W, sandbox, load } = require('./headless');
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: {} };
sandbox.AppStore = { tournaments: [], logAction: () => {}, sync: () => {} };
load('identity-core.js');
load('tournaments-draw.js');
const BYE = 'BYE (Avança Direto)';

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }

const fix = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tour9-single-playin.json'), 'utf8'));
const t = JSON.parse(JSON.stringify(fix));
t.id = 'FIX9';

// pré-condição: repGame "Kelly/Rodrigo VS TBD" com repFill no p2.
const repGame = (t.matches || []).find(m => m.isPhaseRepGame && /Kelly/.test(String(m.p1)) && (m.p2 === 'TBD' || !m.p2));
ok(!!repGame, 'existe o repGame Kelly/Rodrigo VS A definir (com repFill)');
ok(repGame && Array.isArray(repGame.repFill) && repGame.repFill.length === 1, 'repGame tem 1 repFill (o repescado que a dupla vai substituir)');
const repFillTotalBefore = (t.matches || []).reduce((n, m) => n + ((m.repFill || []).length), 0);

// forma a dupla (tonho + Leila) como o painel faz → par {p1Name,p1Uid,p2Name,p2Uid,displayName,_lateJoin}
// (o fixture tem os 2 avulsos: "tonho" string + {uid:Leila}).
t.standbyParticipants = [{ p1Name: 'tonho', p1Uid: '', p2Name: 'Leila', p2Uid: 'NvsXrlXdyQMz1SPjIxaQNId3y6Y2', displayName: 'tonho / Leila', _lateJoin: true }];

const ret = W._fillRepFillWithLateDuplas(t);
ok(ret === 1, 'integrou a dupla formada (got ' + ret + ') — no código velho: função nem existia');

const rg2 = (t.matches || []).find(m => /Kelly/.test(String(m.p1)));
ok(rg2 && rg2.p2 === 'tonho / Leila', 'Kelly/Rodrigo agora joga "tonho / Leila" (preencheu o A definir) (got ' + (rg2 && rg2.p2) + ')');
ok(rg2 && (!Array.isArray(rg2.repFill) || rg2.repFill.length === 0), 'o repFill do repGame foi removido (1 repescado a menos)');
ok(rg2 && !rg2.isPhaseRepGame, 'o jogo da ímpar deixou de ser repGame — virou confronto real');
const repFillTotalAfter = (t.matches || []).reduce((n, m) => n + ((m.repFill || []).length), 0);
ok(repFillTotalAfter === repFillTotalBefore - 1, 'total de repescados recalculado: ' + repFillTotalBefore + '→' + repFillTotalAfter + ' (1 a menos)');
ok((t.participants || []).some(p => (p.displayName || p.name) === 'tonho / Leila'), 'dupla virou inscrita');
ok(!(t.standbyParticipants || []).length, 'saiu da lista de espera');

// playout completo: 5 vencedores da R0 + 3 melhores derrotados → 8 na R1 → resolve num campeão.
const isEmpty = (v) => !v || v === 'TBD' || v === BYE;
const playable = () => W._collectAllMatches(t).filter(m => m && !m.winner && !isEmpty(m.p1) && !isEmpty(m.p2));
let guard = 0;
while (guard++ < 500) {
  const p = playable(); if (!p.length) break;
  const m = p[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = guard % 5;
  if (typeof W._advanceWinner === 'function') W._advanceWinner(t, m);
  if (typeof W._resolveRepFills === 'function') W._resolveRepFills(t);
}
const all = W._collectAllMatches(t);
const stuck = all.filter(m => !m.winner && !isEmpty(m.p1) && !isEmpty(m.p2));
ok(stuck.length === 0, 'playout: nenhum jogo travado (got ' + stuck.length + ' ' + JSON.stringify(stuck.slice(0, 3).map(s => 'R' + s.round + ':' + s.p1 + '/' + s.p2)) + ')');
const maxR = Math.max.apply(null, all.map(m => m.round || 0));
ok(all.filter(m => m.round === maxR).some(m => m.winner), 'playout: rodada final tem campeão');

console.log('\n' + (fail === 0 ? '✅ TODOS PASSARAM' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
process.exit(fail === 0 ? 0 : 1);

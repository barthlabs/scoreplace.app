// test-late-pair-repechage.js — CENÁRIO DO DONO, torneio AO VIVO (SB Casais, 25/jul/2026).
//
// Dono, com a chave em andamento (Dupla Eliminatória, duplas FORMADAS, 4 jogos da R1 sup já com
// placar):
//   1. "Nova dupla foi adicionada após o sorteio. Deve criar automaticamente um novo Jogo na R1 Sup
//      com essa dupla de um lado e 'Adversário a definir' do outro."
//   2. "Quando todos os jogos da R1 tiverem placar lançado, o sistema deve automaticamente
//      identificar o melhor derrotado da R1 Sup e colocá-lo como adversário no jogo com adv a
//      definir."
//
// O QUE ESTAVA QUEBRADO (medido no doc real tour_1781996342871):
//   • `_growAdefinir` desistia se QUALQUER irmão da rodada de entrada já tivesse resultado
//     ("jogado → fica na espera") → a dupla presente (Paulo/Elide, checkedIn 14:05) NUNCA ganhava
//     jogo: ficava presa em standbyParticipants pra sempre. Regra 1 violada.
//   • O "a definir" do jogo tardio nascia como `awaitsLatePartner` puro → no fim da rodada virava
//     BYE (o tardio avançava SEM JOGAR), nunca puxava o melhor derrotado. Regra 2 violada.
//
// Fluxo do teste (só a CF computa — cânone-no-servidor):
//   8 duplas presentes + 3 duplas que chegam depois → sorteio → placar na R1 → 3 integrações
//   tardias → placar no último jogo da R1 → repescagem automática.
//
// node tests/late-pair-repechage.test.js
//
// Harness: `render-harness` carrega a camada REAL do cliente (placar → _advanceWinner →
// _resolveRepFills) e `draw-core` roda os entry points do SERVIDOR (drawInitial,
// integrateLateEntries). Mesma combinação de tests/dupla-elim-late-sweep.test.js.

const H = require('./render-harness');
const win = H.sandbox;
const core = require('../functions-autodraw/draw-core.js');

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name + (got !== undefined ? ' (got ' + JSON.stringify(got) + ')' : '')); }
  else { fail++; console.log('  ✗ ' + name + ' (got ' + JSON.stringify(got) + ')'); }
}

function pair(a, b) {
  return { p1Name: a, p2Name: b, p1Uid: a.toLowerCase(), p2Uid: b.toLowerCase(), displayName: a + ' / ' + b, name: a + ' / ' + b };
}
function checkInPair(t, p) { t.checkedIn[p.p1Uid] = Date.now(); t.checkedIn[p.p2Uid] = Date.now(); }
function all(t) { return (typeof win._collectAllMatches === 'function') ? win._collectAllMatches(t) : (t.matches || []); }
function byId(t, id) { return all(t).filter((m) => m && m.id === id)[0]; }
function upperR1(t) {
  const ms = all(t).filter((m) => m && (m.bracket === 'upper' || m.bracket === 'main' || !m.bracket));
  const r = Math.min.apply(null, ms.map((m) => (typeof m.round === 'number') ? m.round : 1));
  return ms.filter((m) => ((typeof m.round === 'number') ? m.round : 1) === r);
}
// lança placar pelo MESMO caminho do app (mutação + _advanceWinner + repescagem)
function score(t, m, s1, s2) {
  win._applyResultToTournament(t, m.id, { s1: s1, s2: s2, useSets: true });
}

// ── ELENCO ───────────────────────────────────────────────────────────────────
// 8 duplas no sorteio; CATIA, MARILIA e PAULO chegam DEPOIS (tardias).
const P = {};
[['K1', 'K2'], ['F1', 'F2'], ['R1x', 'R2x'], ['L1', 'L2'],
 ['V1', 'V2'], ['C1', 'C2'], ['N1', 'N2'], ['G1', 'G2']].forEach((x, i) => { P['d' + i] = pair(x[0], x[1]); });
const CATIA = pair('Catia', 'Max');
const MARILIA = pair('Marilia', 'Joao');
const PAULO = pair('Paulo', 'Elide');

const t = {
  id: 'tour_sbcasais', name: 'Torneio de Férias só Casais', format: 'Dupla Eliminatória',
  teamSize: 2, enrollmentMode: 'teams', lateEnrollment: 'expand', newMatchups: true,
  currentPhaseIndex: 0, status: 'active', elimThirdPlace: true,
  creatorUid: 'uOrg', organizerEmail: 'org@x.com',
  startDate: '2026-07-25T10:00', endDate: '',
  participants: [P.d0, P.d1, P.d2, P.d3, P.d4, P.d5, P.d6, P.d7],
  standbyParticipants: [], waitlist: [], checkedIn: {}, absent: {}, teamOrigins: {},
  matches: [],
  scoring: { type: 'sets', setsToWin: 1, gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7, tiebreakMargin: 2, countingType: 'tennis' },
};
Object.keys(P).forEach((k) => { t.teamOrigins[P[k].displayName] = 'formada'; checkInPair(t, P[k]); });

// ── 1. SORTEIO (8 duplas → 4 jogos na R1 sup, chave de potência de 2) ────────
console.log('\n── sorteio inicial (8 duplas formadas) ──');
const dres = core.drawInitial(t, {});
ok('draw ok', !!(dres && dres.ok), dres && dres.reason);
ok('4 jogos na R1 superior', upperR1(t).length === 4, upperR1(t).length);
ok('chave de estrutura automática (_duplaAutoStructure)', t._duplaAutoStructure === true, t._duplaAutoStructure);
const R1orig = upperR1(t).map((m) => ({ id: m.id, p1: m.p1, p2: m.p2 }));

// ── 2. REGRA 1 — 1ª tardia (rodada ainda sem placar) entra vs "a definir" ────
console.log('\n── regra 1: 1ª tardia entra vs "a definir" ──');
t.participants.push(CATIA); t.teamOrigins[CATIA.displayName] = 'formada';
t.standbyParticipants.push(Object.assign({ _lateJoin: true }, CATIA));
checkInPair(t, CATIA);
const i1 = core.integrateLateEntries(t, {});
ok('integrate ok / changed', !!(i1 && i1.ok && i1.changed), i1 && { ok: i1.ok, changed: i1.changed, placed: i1.placed });
const gCatia = all(t).filter((m) => m && (m.p1 === CATIA.displayName || m.p2 === CATIA.displayName))[0];
ok('CATIA entrou na chave (jogo criado)', !!gCatia, gCatia && gCatia.id);
ok('CATIA saiu da espera', !(t.standbyParticipants || []).some((p) => p && p.p1Uid === 'catia'), (t.standbyParticipants || []).length);
ok('jogo da CATIA está na R1 SUPERIOR', !!gCatia && upperR1(t).some((m) => m === gCatia), gCatia && { round: gCatia.round, bracket: gCatia.bracket });
ok('adversário = "a definir" (TBD)', !!gCatia && gCatia.p2 === 'TBD', gCatia && [gCatia.p1, gCatia.p2]);
ok('carrega vaga de REPESCAGEM (repFill rank 0, melhor derrotado da R1)',
  !!gCatia && Array.isArray(gCatia.repFill) && gCatia.repFill.length === 1 && gCatia.repFill[0].rank === 0 && gCatia.repFill[0].tagRep === true,
  gCatia && gCatia.repFill);
ok('vencedor do jogo novo tem destino (não evapora)', !!gCatia && !!gCatia.nextMatchId, gCatia && gCatia.nextMatchId);

// ── 3. 2ª tardia PREENCHE o "a definir" da 1ª (tardio tem prioridade sobre repescado) ──
console.log('\n── 2ª tardia preenche o "a definir" (prioridade sobre o repescado) ──');
t.participants.push(MARILIA); t.teamOrigins[MARILIA.displayName] = 'formada';
t.standbyParticipants.push(Object.assign({ _lateJoin: true }, MARILIA));
checkInPair(t, MARILIA);
core.integrateLateEntries(t, {});
const gCatia2 = byId(t, gCatia.id);
ok('MARILIA foi pro slot "a definir" da CATIA', gCatia2 && [gCatia2.p1, gCatia2.p2].indexOf(MARILIA.displayName) !== -1, gCatia2 && [gCatia2.p1, gCatia2.p2]);
ok('descritor de repescagem MORREU (tardio tem prioridade)', !gCatia2.repFill || !gCatia2.repFill.length, gCatia2.repFill);
ok('flag awaitsLatePartner limpa (jogo completo)', !gCatia2.awaitsLatePartner, gCatia2.awaitsLatePartner);
ok('deixou de ser repGame (perdedor dele volta a poder repescar)', !gCatia2.isPhaseRepGame, gCatia2.isPhaseRepGame);

// ── 4. PLACAR nos 4 jogos originais (saldos diferentes → melhor derrotado único) ──
// Espelha o doc real: os 4 jogos sorteados com placar e o jogo dos tardios ainda em aberto.
console.log('\n── placar nos 4 jogos originais (o dos tardios fica pendente) ──');
const r1 = R1orig.map((o) => byId(t, o.id));
score(t, r1[0], 6, 2);   // derrotado saldo -4
score(t, r1[1], 6, 1);   // derrotado saldo -5
score(t, r1[2], 6, 3);   // derrotado saldo -3  ← MELHOR DERROTADO da R1
score(t, r1[3], 6, 0);   // derrotado saldo -6
const melhorDerrotado = (r1[2].winner === r1[2].p1) ? r1[2].p2 : r1[2].p1;
ok('4 jogos originais com vencedor', r1.every((m) => !!m.winner), r1.map((m) => !!m.winner));
ok('jogo dos tardios ainda SEM placar (R1 aberta)', !byId(t, gCatia.id).winner, byId(t, gCatia.id).winner);
ok('melhor derrotado (saldo -3) identificado', !!melhorDerrotado, melhorDerrotado);

// ── 5. 3ª tardia (Paulo/Elide — o caso REAL que ficava preso na espera) ──────
console.log('\n── 3ª tardia: PAULO/ELIDE, com a R1 JÁ com placar (o bug do dono) ──');
t.participants.push(PAULO); t.teamOrigins[PAULO.displayName] = 'formada';
t.standbyParticipants.push(Object.assign({ _lateJoin: true }, PAULO));
checkInPair(t, PAULO);
core.integrateLateEntries(t, {});
const gPaulo = all(t).filter((m) => m && (m.p1 === PAULO.displayName || m.p2 === PAULO.displayName))[0];
ok('PAULO entrou na chave (jogo NOVO vs a definir)', !!gPaulo, gPaulo && { id: gPaulo.id, p1: gPaulo.p1, p2: gPaulo.p2 });
ok('PAULO saiu da espera', !(t.standbyParticipants || []).some((p) => p && p.p1Uid === 'paulo'), (t.standbyParticipants || []).length);
ok('jogo do PAULO na R1 superior', !!gPaulo && upperR1(t).some((m) => m === gPaulo), gPaulo && { round: gPaulo.round, bracket: gPaulo.bracket });
ok('slot do adversário AINDA "a definir" (R1 tem jogo sem placar)', !!gPaulo && gPaulo.p2 === 'TBD', gPaulo && gPaulo.p2);
ok('vaga de repescagem pendente', !!gPaulo && Array.isArray(gPaulo.repFill) && gPaulo.repFill.length === 1, gPaulo && gPaulo.repFill);
ok('vencedor do PAULO tem destino', !!gPaulo && !!gPaulo.nextMatchId, gPaulo && gPaulo.nextMatchId);

// ── 6. REGRA 2 — R1 fecha ⇒ MELHOR DERROTADO entra no "a definir" ────────────
console.log('\n── regra 2: R1 fecha → melhor derrotado preenche o "a definir" ──');
score(t, gCatia2, 6, 0);   // último jogo REAL da R1 (Catia × Marilia): derrotado saldo -6
// melhor derrotado ESPERADO, calculado sobre TODOS os jogos reais da R1 (mesmo critério do motor:
// saldo desc → pontos desc → ordem do jogo na rodada asc)
const derrotados = upperR1(t)
  .filter((m) => m.winner && m.p1 !== 'TBD' && m.p2 !== 'TBD' && !m.isPhaseRepGame)
  .map((m, i) => {
    const lp1 = (m.winner !== m.p1), s1 = +m.scoreP1 || 0, s2 = +m.scoreP2 || 0;
    return { name: lp1 ? m.p1 : m.p2, saldo: lp1 ? (s1 - s2) : (s2 - s1), pts: lp1 ? s1 : s2, ord: i };
  })
  .sort((a, b) => (b.saldo - a.saldo) || (b.pts - a.pts) || (a.ord - b.ord));
const esperado = derrotados.length ? derrotados[0].name : null;
ok('melhor derrotado esperado calculado', !!esperado, derrotados.map((d) => d.name + ' (' + d.saldo + ')'));
const gPaulo2 = byId(t, gPaulo.id);
ok('"a definir" do PAULO foi preenchido', gPaulo2 && gPaulo2.p2 !== 'TBD' && gPaulo2.p2 !== 'BYE (Avança Direto)', gPaulo2 && gPaulo2.p2);
ok('quem entrou é o MELHOR DERROTADO da R1 sup', gPaulo2 && gPaulo2.p2 === esperado, gPaulo2 && { got: gPaulo2.p2, esperado: esperado });
ok('marcado como repescado (p2FromRepechage)', gPaulo2 && gPaulo2.p2FromRepechage === true, gPaulo2 && gPaulo2.p2FromRepechage);
ok('descritor consumido (idempotente)', gPaulo2 && (!gPaulo2.repFill || !gPaulo2.repFill.length), gPaulo2 && gPaulo2.repFill);
ok('PAULO não avançou de BYE (ele JOGA)', gPaulo2 && !gPaulo2.winner && !gPaulo2.isBye, gPaulo2 && { winner: gPaulo2.winner, isBye: gPaulo2.isBye });

// ── 7. SEM DOUBLE-BOOK: o repescado saiu da chave inferior ───────────────────
console.log('\n── sem double-book: o repescado deixou vaga na inferior ──');
const lowVivo = all(t).filter((m) => m && m.bracket === 'lower' && !m.winner &&
  (m.p1 === esperado || m.p2 === esperado));
ok('repescado NÃO está vivo em jogo pendente da inferior', lowVivo.length === 0,
  lowVivo.map((m) => ({ id: m.id, p1: m.p1, p2: m.p2 })));
const lowByes = all(t).filter((m) => m && m.bracket === 'lower' && m.isBye);
ok('vaga liberada virou BYE resolvido (chave inferior não travou)', lowByes.length >= 1, lowByes.map((m) => ({ id: m.id, w: m.winner })));
ok('BYE da inferior propagou o classificado (sem slot morto)',
  lowByes.every((m) => { if (!m.nextMatchId) return true; const n = byId(t, m.nextMatchId); return !!n && (n.p1 === m.winner || n.p2 === m.winner); }),
  lowByes.map((m) => { const n = m.nextMatchId ? byId(t, m.nextMatchId) : null; return n ? [n.p1, n.p2] : 'sem destino'; }));

// ── 8. Nada duplicado / integridade final ───────────────────────────────────
console.log('\n── integridade ──');
const vivos = {};
let dup = null;
const uniq = {};
all(t).forEach((m) => { if (m && m.id != null) uniq[m.id] = m; });
Object.keys(uniq).forEach((id) => {
  const m = uniq[id];
  if (m.winner) return;
  ['p1', 'p2'].forEach((s) => {
    const v = m[s];
    if (!v || v === 'TBD' || v === 'BYE (Avança Direto)') return;
    if (vivos[v]) dup = { lado: v, jogos: [vivos[v], m.id] };
    vivos[v] = m.id;
  });
});
ok('ninguém vivo em 2 jogos pendentes ao mesmo tempo', !dup, dup);
ok('os 4 jogos originais seguem intocados no fim',
  R1orig.every((o) => { const m = byId(t, o.id); return m && m.p1 === o.p1 && m.p2 === o.p2 && !!m.winner; }), true);

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' late-pair-repechage: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail === 0 ? 0 : 1);

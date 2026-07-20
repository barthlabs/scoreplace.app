// INTEGRAÇÃO TARDIA (Eliminatória Simples, expand) — PLAY-THROUGH COMPLETO com o motor REAL, nos
// DOIS modos de resolução (repescagem e bye), escolha do organizador (t.p2Resolution) aplicada
// SEMPRE. Joga a chave INTEIRA via window._advanceWinner (propaga + atribui repescados + resolve
// BYE) e exige que FECHE num campeão. Os testes antigos "jogavam" setando m.winner sem advance →
// repFill/BYE ficavam TBD e o check de "travado" os ignorava (teatro). Pega regressões de:
// presença, topologia, BYE label, atribuição de repescado, 3º lugar, e a escolha bye×repescagem.
const { window: W, sandbox, load } = require('./headless');
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: {} };
sandbox.AppStore = { tournaments: [], logAction: () => {}, sync: () => {}, isOrganizer: () => true, isCreator: () => true, currentUser: { uid: 'org' } };
load('identity-core.js');       // _idMapHas / _participantUids
load('tournaments-draw.js');    // _createExtraGamesFromWaitlist / _rebuildIntegratedBracket
sandbox._displayNameForUid = (uid, fb) => uid ? ('P_' + uid) : (fb || '');
sandbox._pName = (p, fb) => {
  if (!p) return fb || '';
  if (typeof p === 'string') return p;
  if (p.p1Uid || p.p2Uid || (p.p1Name && p.p2Name)) {
    const n1 = p.p1Name || (p.p1Uid ? 'P_' + p.p1Uid : ''), n2 = p.p2Name || (p.p2Uid ? 'P_' + p.p2Uid : '');
    if (n1 && n2) return n1 + ' / ' + n2;
  }
  return p.displayName || p.name || (p.uid ? 'P_' + p.uid : '') || fb || '';
};

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }
const BYE = W._t('bui.byeLabel');
const allOf = (t) => (typeof W._collectAllMatches === 'function') ? W._collectAllMatches(t) : t.matches;

function build8(resolution) {
  const parts = [];
  for (let i = 1; i <= 8; i++) parts.push({ p1Name: 'A' + i, p1Uid: 'a' + i, p2Name: 'B' + i, p2Uid: 'b' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i });
  const dn = i => parts[i - 1].displayName;
  const M = (id, round, p1, p2, next, slot) => ({ id, round, p1, p2, winner: null, bracket: 'main', phaseIndex: 0, nextMatchId: next || null, nextSlot: slot || null });
  const t = {
    id: 'FP', format: 'Eliminatórias Simples', teamSize: 2, enrollmentMode: 'teams', lateEnrollment: 'expand',
    combinedCategories: [], currentPhaseIndex: 0, phases: [{ lateEnrollment: 'expand', format: 'Eliminatórias Simples' }],
    participants: parts.slice(), checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [], teamOrigins: {},
    matches: [
      M('g0', 0, dn(1), dn(2), 's0', 'p1'), M('g1', 0, dn(3), dn(4), 's0', 'p2'),
      M('g2', 0, dn(5), dn(6), 's1', 'p1'), M('g3', 0, dn(7), dn(8), 's1', 'p2'),
      M('s0', 1, 'TBD', 'TBD', 'f', 'p1'), M('s1', 1, 'TBD', 'TBD', 'f', 'p2'),
      M('f', 2, 'TBD', 'TBD', null, null)
    ]
  };
  if (resolution) t.p2Resolution = resolution;
  return t;
}
function simulate(t) {
  let guard = 0;
  while (guard++ < 500) {
    const playable = allOf(t).filter(m => m && !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== BYE && m.p2 !== BYE);
    if (!playable.length) break;
    const m = playable[0];
    m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (guard % 7);
    W._advanceWinner(t, m);
  }
  return guard;
}

// Roda o cenário base num modo e valida os INVARIANTES universais (a chave FECHA).
function runMode(label, resolution, expectByes, expRounds) {
  console.log('\n== ' + label + ' ==');
  const t = build8(resolution);
  t.checkedIn['L1'] = 1; t.checkedIn['L2'] = 1;
  t.standbyParticipants.push({ p1Name: 'L1', p1Uid: '', p2Name: 'L2', p2Uid: '', displayName: 'L1 / L2', name: 'L1 / L2', _lateJoin: true });
  ok(W._createExtraGamesFromWaitlist(t) === 1, label + ': integrou a dupla tardia');

  const rc = {}; t.matches.filter(m => !m.isThirdPlace).forEach(m => rc[m.round] = (rc[m.round] || 0) + 1);
  // topologia por MODO: repescagem = mínima ⌈E/2⌉ (5→3→2→1); bye = pow2 (5 venc → chave de 8: 4→2→1).
  ok(JSON.stringify(rc) === JSON.stringify(expRounds), label + ': topologia ' + JSON.stringify(expRounds) + ' (got ' + JSON.stringify(rc) + ')');
  const _third0 = t.matches.filter(m => m && m.isThirdPlace);
  ok(_third0.length === 1, label + ': 3º lugar CANÔNICO (1 match isThirdPlace em t.matches, got ' + _third0.length + ')');
  ok(!t.thirdPlaceMatch, label + ': SEM t.thirdPlaceMatch separado (uma representação só)');

  const guardUsed = simulate(t);
  ok(guardUsed < 500, label + ': playout sem loop infinito');

  const after = allOf(t);
  const maxR = Math.max.apply(null, after.map(m => m.round));
  const stuck = after.filter(m => m && !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== BYE && m.p2 !== BYE);
  ok(stuck.length === 0, label + ': nenhum jogo travado no fim (got ' + stuck.length + ')');
  const deadTBD = t.matches.filter(m => !m.isThirdPlace && m.round < maxR && (m.p1 === 'TBD' || m.p2 === 'TBD') && !m.winner);
  ok(deadTBD.length === 0, label + ': nenhuma vaga MORTA antes da final (got ' + deadTBD.length + ')');
  const finalM = t.matches.find(m => m.round === maxR && !m.isThirdPlace);
  ok(finalM && finalM.winner, label + ': FINAL tem campeão');

  const anyBye = t.matches.some(m => m.p1 === BYE || m.p2 === BYE || m.isBye);
  ok(anyBye === expectByes, label + ': BYE presente=' + expectByes + ' (got ' + anyBye + ')');
  return t;
}

// ── Modo REPESCAGEM (default): sem BYE, semis reais, 3º lugar com 2 perdedores ──
const tR = runMode('REPESCAGEM (default)', undefined, false, { 0: 5, 1: 3, 2: 2, 3: 1 });
const semisR = tR.matches.filter(m => m.round === 2 && !m.isThirdPlace);
ok(semisR.length === 2 && semisR.every(m => m.winner), 'repescagem: 2 semifinais REAIS jogadas (2 perdedores reais)');
const _3rdR = tR.matches.find(m => m.isThirdPlace);
ok(_3rdR && _3rdR.p1 !== 'TBD' && _3rdR.p2 && _3rdR.p2 !== 'TBD' && _3rdR.winner, 'repescagem: 3º lugar (isThirdPlace) com 2 contestantes reais e resolvido');

// ── Modo BYE (escolha do organizador): folgas onde ímpar, chave também FECHA ──
runMode('BYE (escolha do organizador)', 'bye', true, { 0: 5, 1: 4, 2: 2, 3: 1 });

// ── Presença: dupla SEM check-in NÃO integra ──
console.log('\n== presença ==');
const t2 = build8();
t2.standbyParticipants.push({ p1Name: 'X1', p1Uid: '', p2Name: 'X2', p2Uid: '', displayName: 'X1 / X2', name: 'X1 / X2', _lateJoin: true });
ok(W._createExtraGamesFromWaitlist(t2) === 0, 'dupla SEM check-in NÃO integra');

// ── Par por UID (presente por membro) → integra e fecha ──
console.log('== UID ==');
const t3 = build8();
t3.checkedIn['lu1'] = 1; t3.checkedIn['lu2'] = 1;
t3.standbyParticipants.push({ p1Name: '', p1Uid: 'lu1', p2Name: '', p2Uid: 'lu2', _lateJoin: true });
ok(W._createExtraGamesFromWaitlist(t3) === 1, 'dupla por UID presente integra');
simulate(t3);
ok(t3.matches.find(m => m.round === 3)?.winner, 'UID: final tem campeão');

// ── 2ª DUPLA PREENCHE O "A DEFINIR" da 1ª (gap que quebrou no SB, dono 20/jul) ──
// 1ª dupla tardia cria "dupla vs a-definir" (repFill). A 2ª dupla presente PREENCHE esse slot via
// _fillRepFillWithLateDuplas — NÃO cria outro jogo. Ambas entram; a chave fecha. Antes o teste só
// cobria _createExtraGamesFromWaitlist e esse caminho passava sem gate.
console.log('== 2ª dupla preenche o "a definir" ==');
const t4 = build8();
t4.checkedIn['L1'] = 1; t4.checkedIn['L2'] = 1; t4.checkedIn['P1'] = 1; t4.checkedIn['I1'] = 1;
t4.standbyParticipants.push({ p1Name: 'L1', p2Name: 'L2', p1Uid: '', p2Uid: '', displayName: 'L1 / L2', name: 'L1 / L2', _lateJoin: true });
ok(W._createExtraGamesFromWaitlist(t4) === 1, '1ª dupla cria o jogo "dupla vs a-definir"');
const _ad = t4.matches.find(m => m.round === 0 && m.repFill && m.repFill.length);
ok(!!_ad, 'existe o slot "a definir" (repFill) esperando');
t4.standbyParticipants.push({ p1Name: 'P1', p2Name: 'I1', p1Uid: '', p2Uid: '', displayName: 'Pedro / Iliane', name: 'Pedro / Iliane', _lateJoin: true });
ok(W._fillRepFillWithLateDuplas(t4) === 1, '2ª dupla PREENCHE o "a definir" (_fillRepFillWithLateDuplas=1)');
const _filled = t4.matches.find(m => (m.p1 === 'L1 / L2' || m.p2 === 'L1 / L2'));
ok(_filled && !(_filled.repFill && _filled.repFill.length) && _filled.p1 !== 'TBD' && _filled.p2 !== 'TBD', 'o "a definir" da 1ª dupla foi PREENCHIDO (jogo real: sem repFill, sem TBD, com adversário)');
simulate(t4);
ok(allOf(t4).find(m => m.round === Math.max.apply(null, allOf(t4).map(x => x.round)) && !m.isThirdPlace)?.winner, '2ª-dupla: chave fecha num campeão');
ok(allOf(t4).filter(m => m && !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== BYE && m.p2 !== BYE).length === 0, '2ª-dupla: nenhum jogo travado');

console.log('\n' + (fail === 0 ? '✅ late-integration-fullplay: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fail > 0) process.exit(1);

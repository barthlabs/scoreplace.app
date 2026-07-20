// INTEGRAÇÃO TARDIA (Eliminatória Simples, expand) — PLAY-THROUGH COMPLETO com o motor REAL.
// Diferente dos testes antigos (que "jogavam" setando m.winner sem _advanceWinner → repFill/BYE
// ficavam TBD pra sempre e o check de "travado" os IGNORAVA = teatro), aqui joga a chave INTEIRA
// via window._advanceWinner (propaga vencedor + atribui repescados + auto-resolve BYE). Invariantes
// que PROVAM que a chave FECHA: R0=5, R1=3, R2=2 (um com BYE), R3=final; repescagem mínima (1
// direto + 1 no jogo tardio = 2, não 4); BYE canônico resolve; 3º lugar disputa; NENHUMA vaga morta.
// Pega regressões de: presença (não integra sem check-in), topologia (over-repescagem), BYE label,
// atribuição de repescado no play, 3º lugar apagado no rebuild.
const { window: W, sandbox, load } = require('./headless');
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: {} };
sandbox.AppStore = { tournaments: [], logAction: () => {}, sync: () => {}, isOrganizer: () => true, isCreator: () => true, currentUser: { uid: 'org' } };
load('identity-core.js');       // _idMapHas / _participantUids
load('tournaments-draw.js');    // _createExtraGamesFromWaitlist / _rebuildIntegratedBracket
// resolvedores de nome por uid (store.js não carrega no harness) — espelham o app: uid→nome.
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

// Chave 8 duplas single-elim JÁ SORTEADA (R0 4 jogos → semis → final), expand, mesmo-dia.
function build8() {
  const parts = [];
  for (let i = 1; i <= 8; i++) parts.push({ p1Name: 'A' + i, p1Uid: 'a' + i, p2Name: 'B' + i, p2Uid: 'b' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i });
  const dn = i => parts[i - 1].displayName;
  const M = (id, round, p1, p2, next, slot) => ({ id, round, p1, p2, winner: null, bracket: 'main', phaseIndex: 0, nextMatchId: next || null, nextSlot: slot || null });
  return {
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
}

function simulate(t) {
  let guard = 0;
  while (guard++ < 500) {
    const playable = allOf(t).filter(m => m && !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== BYE && m.p2 !== BYE);
    if (!playable.length) break;
    const m = playable[0];
    m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (guard % 7); // saldo variado p/ ranking de repescagem
    W._advanceWinner(t, m);
  }
  return guard;
}

// ── Cenário 1: dupla tardia de GUESTS presente → integra → joga tudo ──
console.log('\n== 8 duplas + 1 dupla tardia (guest, presente) ==');
const t = build8();
t.checkedIn['L1'] = 1; t.checkedIn['L2'] = 1;
t.standbyParticipants.push({ p1Name: 'L1', p1Uid: '', p2Name: 'L2', p2Uid: '', displayName: 'L1 / L2', name: 'L1 / L2', _lateJoin: true });

const created = W._createExtraGamesFromWaitlist(t);
ok(created === 1, 'integrou (created=1, got ' + created + ')');

const rc = {}; t.matches.forEach(m => rc[m.round] = (rc[m.round] || 0) + 1);
ok(rc[0] === 5, 'R0 = 5 jogos (got ' + rc[0] + ')');
ok(rc[1] === 3, 'R1 = 3 jogos (got ' + rc[1] + ')');
ok(rc[2] === 2, 'R2 = 2 jogos (got ' + rc[2] + ')');
ok(rc[3] === 1, 'R3 = final (got ' + rc[3] + ')');
ok(t.hasRepechage === true, 'repescagem ligada');
ok(t.repechageConfig && t.repechageConfig.bestLoserCount === 1, 'bestLoserCount = 1 direto (got ' + (t.repechageConfig && t.repechageConfig.bestLoserCount) + ')');
ok(!!t.thirdPlaceMatch, '3º lugar criado no rebuild');
ok(t.matches.some(m => m.round === 0 && m.repFill && m.repFill.length), 'jogo tardio tem repFill (a definir p/ repescado)');
ok(t.matches.some(m => m.round === 1 && m.awaitsBestLoser), 'R1 tem slot de repescado direto (awaitsBestLoser)');

const guardUsed = simulate(t);
ok(guardUsed < 500, 'playout terminou sem loop infinito (iterações ' + guardUsed + ')');

const after = allOf(t);
const stuck = after.filter(m => m && !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== BYE && m.p2 !== BYE);
ok(stuck.length === 0, 'nenhum jogo travado no fim (got ' + stuck.length + ')');
const deadTBD = t.matches.filter(m => m.round < 3 && (m.p1 === 'TBD' || m.p2 === 'TBD') && !m.winner);
ok(deadTBD.length === 0, 'nenhuma vaga MORTA (TBD sem preencher) antes da final (got ' + deadTBD.length + ')');
const finalM = t.matches.find(m => m.round === 3);
ok(finalM && finalM.winner, 'FINAL tem campeão (got ' + (finalM && finalM.winner) + ')');
const byeM = t.matches.find(m => m.p2 === BYE || m.p1 === BYE || m.isBye);
ok(byeM && byeM.winner, 'jogo com BYE resolveu (vencedor ímpar avançou)');
// 3º lugar: EXISTE e recebe o(s) perdedor(es) de semi disponível(is). Na topologia mínima uma
// das semis é BYE → só 1 perdedor real (o outro slot fica "a definir"). Não é chave morta: o
// campeão e o vice estão definidos. Exigimos que o 3º lugar tenha AO MENOS 1 contestante real.
const _3rd = t.thirdPlaceMatch;
const _3rdReal = _3rd && ((_3rd.p1 && _3rd.p1 !== 'TBD') || (_3rd.p2 && _3rd.p2 !== 'TBD'));
ok(_3rdReal, '3º lugar tem ao menos o perdedor de semifinal (got p1=' + (_3rd && _3rd.p1) + ' p2=' + (_3rd && _3rd.p2) + ')');

// ── Cenário 2: dupla tardia SEM presença → NÃO integra ──
console.log('== dupla tardia SEM presença ==');
const t2 = build8();
t2.standbyParticipants.push({ p1Name: 'X1', p1Uid: '', p2Name: 'X2', p2Uid: '', displayName: 'X1 / X2', name: 'X1 / X2', _lateJoin: true });
ok(W._createExtraGamesFromWaitlist(t2) === 0, 'dupla SEM check-in NÃO integra (created=0)');

// ── Cenário 3: par por UID presente (check-in por uid de membro) → integra ──
console.log('== dupla tardia por UID (presente por membro) ==');
const t3 = build8();
t3.checkedIn['lu1'] = 1; t3.checkedIn['lu2'] = 1;
t3.standbyParticipants.push({ p1Name: '', p1Uid: 'lu1', p2Name: '', p2Uid: 'lu2', _lateJoin: true });
const c3 = W._createExtraGamesFromWaitlist(t3);
ok(c3 === 1, 'dupla por UID presente integra (created=1, got ' + c3 + ')');
simulate(t3);
const f3 = t3.matches.find(m => m.round === 3);
ok(f3 && f3.winner, 'cenário UID: final tem campeão');

console.log('\n' + (fail === 0 ? '✅ late-integration-fullplay: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fail > 0) process.exit(1);

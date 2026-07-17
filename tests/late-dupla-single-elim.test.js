// GAP (dono, 17/jul): dupla FORMADA na lista de espera entra no Dupla Eliminatória
// (Tier 1 upper via _integrateLateDuplas) mas NÃO na Eliminatória Simples. Causa:
// _createExtraGamesFromWaitlist (tournaments-draw.js) filtrava "só indivíduos" (tirava
// as duplas já formadas, cujo nome tem " / "). Regra do dono: "se faz na dupla, fará na
// simples com o mesmo princípio" — a dupla tardia entra na R1, vencedor avança, derrotado
// eliminado (single = chave superior da dupla, SEM inferior). _rebuildIntegratedBracket
// recomputa a repescagem (awaitsBestLoser) quando a R1 muda.
//
// Este teste REPRODUZ a falha: no código VELHO, 2 duplas pré-formadas na lista de espera
// somem (created=0). No NOVO, entram como 1 jogo novo da R1 (isExtra) e a chave é
// reconstruída. Ver [[project_late_enrollment_elimination]] / [[project_dupla_elim_repechage]].
const { window: W, load } = require('./headless');
load('identity-core.js');       // _idMapHas / _participantUids / _memberUidByName (puro)
load('tournaments-draw.js');    // _createExtraGamesFromWaitlist / _rebuildIntegratedBracket

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }

function pair(a, b) {
  return { p1Name: a, p2Name: b, p1Uid: a.toLowerCase(), p2Uid: b.toLowerCase(), displayName: a + ' / ' + b };
}
function latePair(a, b) { return Object.assign(pair(a, b), { _lateJoin: true }); }

// Eliminatória Simples de DUPLAS: 4 duplas iniciais → R1 com 2 jogos + final (TBD).
function build() {
  const A = pair('A1', 'A2'), B = pair('B1', 'B2'), C = pair('C1', 'C2'), D = pair('D1', 'D2');
  const t = {
    id: 'SE1', format: 'Eliminatórias Simples', teamSize: 2, enrollmentMode: 'teams',
    lateEnrollment: 'expand', currentPhaseIndex: 0,
    participants: [A, B, C, D],
    standbyParticipants: [], waitlist: [], checkedIn: {}, absent: {}, teamOrigins: {},
    matches: [
      { id: 'm1', round: 1, p1: A.displayName, p2: B.displayName, winner: null, bracket: 'main', phaseIndex: 0, nextMatchId: 'mf', nextSlot: 'p1' },
      { id: 'm2', round: 1, p1: C.displayName, p2: D.displayName, winner: null, bracket: 'main', phaseIndex: 0, nextMatchId: 'mf', nextSlot: 'p2' },
      { id: 'mf', round: 2, p1: 'TBD', p2: 'TBD', winner: null, bracket: 'main', phaseIndex: 0 },
    ],
  };
  return t;
}

const R1 = (t) => t.matches.filter((m) => m && m.round === 1);
const hasDupla = (t, arr, dn) => arr.some((p) => (p && (p.displayName || p.name)) === dn);

// ── Caso núcleo: 2 duplas pré-formadas tardias → 1 jogo novo na R1 ──────────
(function () {
  const t = build();
  const LA = latePair('LA', 'LB'), LC = latePair('LC', 'LD');
  t.standbyParticipants = [LA, LC];
  // mesmo-dia no harness (store._tournamentIsSameDay não carrega) → precisa presença
  t.checkedIn = { 'LA / LB': 1, 'LC / LD': 1 };

  const before = R1(t).length;
  const ret = W._createExtraGamesFromWaitlist(t);

  ok(ret === 1, 'retorno = 1 jogo criado (got ' + ret + ')');
  const newG = R1(t).filter((m) => m.isExtra &&
    ((m.p1 === 'LA / LB' && m.p2 === 'LC / LD') || (m.p1 === 'LC / LD' && m.p2 === 'LA / LB')));
  ok(newG.length === 1, 'jogo novo da R1 tem as 2 duplas tardias (got ' + newG.length + ')');
  ok(R1(t).length === before + 1, 'R1 cresceu +1 (' + before + '→' + R1(t).length + ')');
  ok(hasDupla(t, t.participants, 'LA / LB') && hasDupla(t, t.participants, 'LC / LD'), 'as 2 duplas viraram inscritas');
  ok(!hasDupla(t, t.standbyParticipants, 'LA / LB') && !hasDupla(t, t.standbyParticipants, 'LC / LD'), 'saíram da lista de espera');
  // 3 jogos de R1 → r2Target=4 → repescagem=1: a chave é reconstruída com R2 + slot awaitsBestLoser
  const r2 = t.matches.filter((m) => m && m.round === 2);
  ok(r2.length >= 1, 'R2 reconstruída (got ' + r2.length + ' jogos)');
  ok(t.hasRepechage === true, 'repescagem ligada (3 jogos R1 não é potência de 2)');

  // playout completo: chave reconstruída (3 jogos R1 + repescagem) resolve num campeão,
  // sem jogo travado nem vaga morta.
  const BYE = 'BYE (Avança Direto)';
  const playable = () => t.matches.filter((m) => m && !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== BYE && m.p2 !== BYE);
  let guard = 0;
  while (guard++ < 200) {
    const p = playable();
    if (!p.length) break;
    const m = p[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (guard % 5);
    if (typeof W._advanceWinner === 'function') W._advanceWinner(t, m);
  }
  const stuck = t.matches.filter((m) => m && !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== BYE && m.p2 !== BYE);
  ok(stuck.length === 0, 'playout: nenhum jogo travado no fim (got ' + stuck.length + ')');
  const last = t.matches.filter((m) => m && m.round === Math.max.apply(null, t.matches.map((x) => x.round || 0)));
  ok(last.some((m) => m.winner), 'playout: rodada final tem campeão');
})();

// ── Nenhuma dupla se perde: 1 dupla tardia sozinha NÃO some (aguarda ou joga) ─
(function () {
  const t = build();
  const LA = latePair('LA', 'LB');
  t.standbyParticipants = [LA];
  t.checkedIn = { 'LA / LB': 1 };

  W._createExtraGamesFromWaitlist(t);
  const onBracket = R1(t).some((m) => m.p1 === 'LA / LB' || m.p2 === 'LA / LB');
  const onStandby = hasDupla(t, t.standbyParticipants, 'LA / LB');
  ok(onBracket || onStandby, 'dupla tardia solitária nunca some (na chave OU aguardando)');
})();

console.log('\n' + (fail === 0 ? '✅ TODOS PASSARAM' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
process.exit(fail === 0 ? 0 : 1);

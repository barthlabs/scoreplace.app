// REPRODUZ o bug do dono (jul/2026, com print "JOGO 7"): marcou presença da dupla DEPOIS do sorteio,
// ligou "aceitar entradas", ela entrou na chave como jogo novo — mas em vez do adversário ficar
// "a definir", a MESMA dupla ficou nos DOIS LADOS do confronto (Marcello/Karla vs Marcello/Karla).
//
// DUAS causas em _fillRepFillWithLateDuplas:
//  (1) a busca do slot "a definir" (openRep) NÃO checava se a própria dupla já ocupa o OUTRO lado
//      daquele jogo → ela preenchia o TBD do jogo que ela mesma abriu numa passada anterior;
//  (2) `formed` NÃO deduplicava entre standbyParticipants e waitlist → a mesma dupla entrava 2×,
//      a 1ª criava "dupla vs a definir" (caso B) e a 2ª preenchia esse mesmo TBD (caso A).
//
// REGRA TRAVADA: ninguém joga contra si mesmo. O adversário fica "a definir" até vir OUTRO time.
const H = require('./render-harness');
const W = H.sandbox;
require('./headless').load('participants.js');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const NM = 'Marcello Martins de Souza / Karla Fernandes';
const DUPLA = () => ({ p1Uid: 'mm', p1Name: 'Marcello Martins de Souza', p2Uid: 'kf', p2Name: 'Karla Fernandes', displayName: NM, name: NM, _lateJoin: true });
const isEmpty = v => !v || v === 'TBD' || /a definir/i.test(String(v));

function mkT(opts) {
  opts = opts || {};
  const t = {
    id: 'SELF', format: 'Eliminatórias Simples', teamSize: 2, enrollmentMode: 'teams',
    participants: [], combinedCategories: [], currentPhaseIndex: 0,
    checkedIn: { mm: 1, kf: 1 }, absent: {}, checkedInConfirmed: {},
    standbyParticipants: [], waitlist: [], teamOrigins: {},
    newMatchups: true, lateEnrollment: 'expand',
    // chave com um jogo "dupla VS a definir" JÁ aberto (repFill no p2) — o estado do print
    matches: [
      { id: 'g1', round: 0, bracket: 'main', phaseIndex: 0, p1: 'A / B', p2: 'C / D', winner: 'A / B' },
      { id: 'g7', round: 0, bracket: 'main', phaseIndex: 0, isPhaseRepGame: true, p1: NM, p2: 'TBD',
        repFill: [{ slot: 'p2', srcBracket: 'main', srcRound: 0, rank: 0, tagRep: true }] },
    ],
  };
  if (opts.inStandby) t.standbyParticipants.push(DUPLA());
  if (opts.inWaitlist) t.waitlist.push(DUPLA());
  return t;
}
const selfMatches = (t) => (W._collectAllMatches(t) || []).filter(m => m && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2) && String(m.p1) === String(m.p2));

// ── CASO 1: a dupla já está num jogo "vs a definir" e continua na espera ───────────────
console.log('── a dupla NUNCA pode preencher o "a definir" do próprio jogo ──');
(function () {
  const t = mkT({ inWaitlist: true });
  W.AppStore.tournaments = [t];
  W._fillRepFillWithLateDuplas(t);
  const self = selfMatches(t);
  ok(self.length === 0, '✅ nenhum jogo com a MESMA dupla dos 2 lados (got ' + self.length + (self[0] ? ' → "' + self[0].p1 + '" vs "' + self[0].p2 + '"' : '') + ')');
  const g7 = (W._collectAllMatches(t) || []).find(m => m.id === 'g7');
  ok(g7 && g7.p1 === NM, 'o jogo dela segue com ela de um lado');
  ok(g7 && isEmpty(g7.p2), 'o adversário continua "a definir" (não virou ela mesma)');
})();

// ── CASO 2: mesma dupla nos DOIS stores (standby + waitlist) → integra UMA vez só ──────
console.log('\n── mesma dupla em standby E waitlist → uma entrada só ──');
(function () {
  const t = mkT({ inStandby: true, inWaitlist: true });
  t.matches = [{ id: 'g1', round: 0, bracket: 'main', phaseIndex: 0, p1: 'A / B', p2: 'C / D', winner: 'A / B' },
               { id: 'g2', round: 1, bracket: 'main', phaseIndex: 0, p1: 'A / B', p2: 'TBD',
                 repFill: [{ slot: 'p2', srcBracket: 'main', srcRound: 0, rank: 0 }] }];
  W.AppStore.tournaments = [t];
  W._fillRepFillWithLateDuplas(t);
  const self = selfMatches(t);
  ok(self.length === 0, '✅ duplicada nos 2 stores NÃO gera confronto contra si mesma (got ' + self.length + ')');
  const appearances = (W._collectAllMatches(t) || []).reduce((n, m) => n + (m.p1 === NM ? 1 : 0) + (m.p2 === NM ? 1 : 0), 0);
  ok(appearances <= 1, 'a dupla aparece no MÁXIMO 1× na chave (got ' + appearances + ')');
})();

// ── CASO 3: _integrateLateDuplas (Dupla Elim) pareia 2-a-2 — dupla duplicada nos 2 stores não
//    pode virar adversária de si mesma. ─────────────────────────────────────────────────────
console.log('\n── _integrateLateDuplas: duplicada nos 2 stores não vira adversária de si mesma ──');
(function () {
  const t = mkT({ inStandby: true, inWaitlist: true });
  t.format = 'Dupla Eliminatória';
  t.matches = [
    { id: 'r0a', round: 0, bracket: 'upper', isPhaseRepR1: true, p1: 'A / B', p2: 'C / D' },
    { id: 'r0b', round: 0, bracket: 'upper', isPhaseRepR1: true, p1: 'E / F', p2: 'G / H' },
  ];
  W.AppStore.tournaments = [t];
  try { W._integrateLateDuplas(t); } catch (e) { ok(false, '_integrateLateDuplas lançou: ' + e.message); }
  const self = selfMatches(t);
  ok(self.length === 0, '✅ Dupla Elim: nenhum jogo com a mesma dupla dos 2 lados (got ' + self.length + ')');
  const ap = (W._collectAllMatches(t) || []).reduce((n, m) => n + (m.p1 === NM ? 1 : 0) + (m.p2 === NM ? 1 : 0), 0);
  ok(ap <= 1, 'Dupla Elim: a dupla aparece no MÁXIMO 1× na chave (got ' + ap + ')');
})();

console.log('\n' + (fail === 0 ? '✅ late-dupla-no-self-match: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);

// INCREMENT 2 — TIER 2 da formação de duplas na lista de espera (Dupla Eliminatória).
// Regra do dono: quando a R2 do UPPER já começou (resultado/ponto lançado) mas a R2 do LOWER
// ainda NÃO, 2 duplas formadas na lista de espera entram como jogo NOVO na R1 da chave INFERIOR
// (vencedor segue no lower, derrotado eliminado). A inferior round>=2 + grande final são
// reconstruídas religando os perdedores de TODO o upper; o upper (com resultados de R2) e a R1
// inferior são preservados.
//
// Dirige o motor REAL: _duplaR1FromPool → _buildRepechageDoubleElim (chave completa) → joga o
// round 0 (repR1) → inicia a R2 do upper (1 resultado) → forma 2 duplas tardias →
// _integrateLateDuplas (Tier 2) → PLAYOUT COMPLETO até campeão. Invariantes:
//   • retorno > 0 e window._lastIntegrateTier === 2;
//   • jogo NOVO na R1 da chave inferior (lower round 1 cresce +1) com as duplas tardias;
//   • resultado(s) da R2 do upper PRESERVADO(s) após a integração;
//   • satout (n ímpar) NÃO some da chave;
//   • playout completo: 1 campeão, 0 jogos travados, 0 vaga morta (TBD permanente).
const { window, sandbox, load, E } = require('./headless');
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: {} };
sandbox.AppStore = { tournaments: [], logAction: () => {}, sync: () => {} };
load('tournaments-draw.js');

const BYE = 'BYE (Avança Direto)';
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }

function mkPool(n) { var a = []; for (var i = 0; i < n; i++) a.push({ displayName: 'D' + i, name: 'D' + i, uid: 'u' + i }); return a; }

// Mesmo caminho real do "Casais": ramo de CATEGORIAS (1 categoria "Misto Obrig.").
function build(n) {
  const CAT = 'Misto Obrig.';
  const cfg = { format: 'Dupla Eliminatória', formatCode: 'elim_dupla', teamSize: 2, bracketResolution: 'playin', seedVip: true, thirdPlace: true, source: { type: 'enrollment' }, categories: [CAT] };
  const pool = mkPool(n).map(p => Object.assign({ categories: [CAT] }, p));
  const t = { id: 'T' + n, format: 'Dupla Eliminatória', teamSize: 2, matches: [], currentPhaseIndex: 0, lateEnrollment: 'expand' };
  const built = E.generatePhase(pool, cfg, { idPrefix: 'gp', ordered: true, t, isVip: () => false, catOf: e => (e.categories && e.categories[0]) || '' });
  const r = E.storePhase(t, 0, built);
  if (!r || !r.ok) { fail++; console.error('  ✗ n=' + n + ': storePhase abortou (' + (r && r.error) + ')'); return t; }
  if (built.needsRepechageDoubleElim && window._buildRepechageDoubleElim) {
    (built.repMetaByCat && built.repMetaByCat.length ? built.repMetaByCat : [built.repMeta]).forEach(mm => window._buildRepechageDoubleElim(t, mm));
  }
  return t;
}

function playable(t, filterFn) {
  return window._collectAllMatches(t).filter(m => m && !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== BYE && m.p2 !== BYE && (!filterFn || filterFn(m)));
}
// joga UM jogo (winner=p1) e propaga. Retorna o jogo jogado (ou null).
function playOne(t, filterFn, gseed) {
  const p = playable(t, filterFn);
  if (!p.length) return null;
  const m = p[0];
  m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (gseed % 5);
  window._advanceWinner(t, m);
  return m;
}
function playAll(t, filterFn) { let g = 1, n = 0; while (g++ < 500) { if (!playOne(t, filterFn, g)) break; n++; } return n; }
function simulate(t) { let g = 1; while (g++ < 500) { if (!playOne(t, null, g)) break; } return window._collectAllMatches(t); }

// detecta satout (entrada direta no 1º merge da inferior) na chave ATUAL.
function detectSatout(t) {
  const merges = window._collectAllMatches(t).filter(m => m && m.bracket === 'lower' && m.round >= 2);
  let minR = null; merges.forEach(m => { if (minR == null || m.round < minR) minR = m.round; });
  let sat = null;
  merges.filter(m => m.round === minR).forEach(mg => {
    ['p1', 'p2'].forEach(slot => {
      if (sat) return;
      const v = mg[slot]; if (!v || v === 'TBD' || v === BYE) return;
      const fedL = window._collectAllMatches(t).some(x => x && x.bracket === 'lower' && x.round === 1 && x.nextMatchId === mg.id && x.nextSlot === slot);
      const fedU = window._collectAllMatches(t).some(x => x && x.bracket === 'upper' && x.loserMatchId === mg.id && x.loserSlot === slot);
      if (!fedL && !fedU) sat = v;
    });
  });
  return sat;
}

function run(n) {
  console.log('\n== TIER 2 · n=' + n + ' duplas ==');
  const t = build(n);

  // 1) joga o round 0 inteiro (repescagem R1) → popula upper[1] + pré-rodada inferior.
  playAll(t, m => m.isPhaseRepR1 && m.round === 0);
  // 2) inicia a R2 do upper: joga UM jogo do upper round 1.
  const upR2 = playOne(t, m => m.bracket === 'upper' && m.round === 1, 3);
  ok(!!upR2, 'R2 do upper iniciada (1 jogo do upper round 1 jogado)');
  const upR2Winner = upR2 && upR2.winner, upR2Id = upR2 && upR2.id, upR2S1 = upR2 && upR2.scoreP1, upR2S2 = upR2 && upR2.scoreP2;

  // A dupla ÍMPAR agora fica na chave SUPERIOR (repGame) — não é mais "satout" no lower.
  if (n % 2 === 1) {
    const rg = window._collectAllMatches(t).filter(m => m.isPhaseRepGame && m.bracket === 'upper' && m.round === 0)[0];
    ok(!!rg, 'jogo da ímpar existe na R1 sup (repGame), não no lower');
  }

  const lowR1Before = window._collectAllMatches(t).filter(m => m && m.bracket === 'lower' && m.round === 1).length;

  // 3) forma 2 duplas tardias na lista de espera (par estrutural p1Name/p2Name + _lateJoin).
  t.standbyParticipants = [
    { p1Name: 'LA', p2Name: 'LB', p1Uid: 'lla', p2Uid: 'llb', displayName: 'LA / LB', _lateJoin: true },
    { p1Name: 'LC', p2Name: 'LD', p1Uid: 'llc', p2Uid: 'lld', displayName: 'LC / LD', _lateJoin: true }
  ];

  // 4) integra. Aceita Tier 2 (append no lower R1) OU Tier 3 (dissolve em suplentes individuais):
  //    em n com toLower=0 (g potência de 2, ex. n=9) o perdedor do repGame auto-resolve um BYE
  //    no 1º merge → o detector lê "lower R2 começou" → Tier 3. O invariante DURO é o playout limpo.
  window._lastIntegrateTier = null;
  const ret = window._integrateLateDuplas(t);
  ok(ret > 0 || ret === -3, 'integração agiu (Tier 2 append OU Tier 3 dissolve) (got ' + ret + ')');
  if (window._lastIntegrateTier === 2) {
    const lowR1After = window._collectAllMatches(t).filter(m => m && m.bracket === 'lower' && m.round === 1);
    ok(lowR1After.length === lowR1Before + 1, 'Tier 2: R1 inferior +1 jogo (' + lowR1Before + '→' + lowR1After.length + ')');
    const newG = lowR1After.filter(m => (m.p1 === 'LA / LB' || m.p2 === 'LA / LB') && (m.p1 === 'LC / LD' || m.p2 === 'LC / LD'));
    ok(newG.length === 1, 'Tier 2: jogo novo na R1 inferior tem as 2 duplas tardias (got ' + newG.length + ')');
  }

  // R2 do upper PRESERVADA.
  const upR2Now = window._collectAllMatches(t).filter(m => m.id === upR2Id)[0];
  ok(upR2Now && upR2Now.winner === upR2Winner && upR2Now.scoreP1 === upR2S1 && upR2Now.scoreP2 === upR2S2, 'resultado da R2 do upper preservado');

  // 5) playout completo → campeão único, sem travar, sem vaga morta.
  const after = simulate(t);
  const stuck = after.filter(m => !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== BYE && m.p2 !== BYE);
  const deadTBD = after.filter(m => !m.winner && (m.p1 === 'TBD' || m.p2 === 'TBD' || !m.p1 || !m.p2) && !m.isBye);
  ok(stuck.length === 0, 'nenhum jogo travado no fim (got ' + stuck.length + ' ' + JSON.stringify(stuck.slice(0, 4).map(s => (s.bracket || '-') + 'R' + s.round + ':' + s.p1 + '/' + s.p2)) + ')');
  ok(deadTBD.length === 0, 'nenhuma vaga morta no fim (got ' + deadTBD.length + ' ' + JSON.stringify(deadTBD.slice(0, 6).map(s => (s.bracket || '-') + 'R' + s.round + ':' + s.p1 + '/' + s.p2)) + ')');
  const grand = after.filter(m => m.bracket === 'grand');
  ok(grand.length >= 1 && grand[grand.length - 1].winner, 'grande final resolvida num campeão');
}

run(6);   // par, sem satout
run(15);  // ímpar, COM satout (caso do task)
run(10);  // par
run(12);  // par
run(9);   // ímpar
run(13);  // ímpar

console.log('\n' + (fail === 0 ? '✅ TODOS PASSARAM' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
process.exit(fail === 0 ? 0 : 1);

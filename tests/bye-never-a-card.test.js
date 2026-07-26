// BYE NUNCA É UM CARD DE JOGO — inclusive na DUPLA ELIMINATÓRIA.
//
// Dono, 26/jul/2026: _"não precisamos mostrar esse box partida com 1 dupla e bye avança direto.
// só colocar a dupla que recebe o bye na rodada seguinte com a tag BYE e adv a definir basta.
// sem mostrar na rodada jogo que não acontecerá, apenas confrontos verdadeiros."_ +
// _"assim deve ser SEMPRE que houver bye. padrão canonizado."_
//
// A regra é canônica desde a v2.8.87, mas vivia só no renderer de FASE — e
// `_renderPhaseBracket` retorna pra `renderDoubleElimBracket` ANTES da inferência. Resultado
// medido na tela do dono: card "PARTIDA — Nei/Patrícia vs BYE (Avança Direto)" na chave, e o
// time que passou de bye SEM tag nenhuma na rodada seguinte.
//
// Aqui o alvo é a REGRA, não o HTML: _inferByeTags marca quem passou de bye pra rodada r+1 e
// só ela; e _isByeMatch reconhece as duas formas do rótulo (o filtro dos renderers depende
// disso). Ver [[project_bracket_bye_and_3rd4th]] / [[project_round_naming]].
const { window: W, sandbox } = require('./render-harness');
// Se a API canônica não existir (código anterior), cai num no-op: o teste então mede o que
// importa — o HTML do renderer (bloco 6) — em vez de estourar por ausência de função.
if (typeof W._inferByeTags !== 'function') W._inferByeTags = function (ms) { return ms; };

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const BYE = 'BYE (Avança Direto)';

// ── 1. _isByeMatch reconhece as duas formas + não confunde jogo real ─────────────────────
ok(W._isByeMatch({ isBye: true }), 'isBye:true é bye');
ok(W._isByeMatch({ p2: BYE }), 'rótulo "BYE (Avança Direto)" é bye mesmo sem a flag');
ok(W._isByeMatch({ p2: 'BYE' }), 'rótulo curto "BYE" é bye');
ok(!W._isByeMatch({ p1: 'A / B', p2: 'C / D' }), 'confronto real NÃO é bye');
ok(!W._isByeMatch({ p1: 'A / B', p2: 'TBD' }), '"a definir" (TBD) NÃO é bye — é jogo que vai acontecer');

// ── 2. quem passa de bye leva a tag na rodada SEGUINTE (e só nela) ───────────────────────
(function () {
  var ms = [
    // upper R1: um bye (Nei/Patrícia passa) e um jogo real
    { id: 'u1', bracket: 'upper', round: 1, p1: 'Nei / Patrícia', p2: BYE, isBye: true, winner: 'Nei / Patrícia' },
    { id: 'u2', bracket: 'upper', round: 1, p1: 'Kelly / Rodrigo', p2: 'Vivi / Gersom', winner: 'Kelly / Rodrigo' },
    // upper R2: o beneficiado encontra o vencedor do jogo real
    { id: 'u3', bracket: 'upper', round: 2, p1: 'Nei / Patrícia', p2: 'Kelly / Rodrigo' },
    // upper R3: já avançou por VITÓRIA — a tag não pode viajar junto
    { id: 'u4', bracket: 'upper', round: 3, p1: 'Nei / Patrícia', p2: 'TBD' }
  ];
  W._inferByeTags(ms);
  var r2 = ms.find(m => m.id === 'u3'), r3 = ms.find(m => m.id === 'u4');
  ok(r2.p1FromBye === true, 'tag BYE cai na rodada SEGUINTE ao bye — got ' + JSON.stringify(r2.p1FromBye));
  ok(r2.p2FromBye == null, 'quem chegou por VITÓRIA no mesmo jogo não leva tag');
  ok(r3.p1FromBye == null, 'a tag NÃO viaja pra rodada 3 (some quando avança por vitória)');
})();

// ── 3. a tag é por CHAVE — homônimo na inferior não herda a do upper ─────────────────────
(function () {
  var ms = [
    { id: 'u1', bracket: 'upper', round: 1, p1: 'A / B', p2: BYE, isBye: true, winner: 'A / B' },
    { id: 'l1', bracket: 'lower', round: 2, p1: 'A / B', p2: 'C / D' }   // mesma dupla, OUTRA chave
  ];
  W._inferByeTags(ms);
  ok(ms[1].p1FromBye == null, 'bye do upper não marca card da chave INFERIOR');
})();

// ── 4. não sobrescreve flag já gravada pelo gerador ──────────────────────────────────────
(function () {
  var ms = [
    { id: 'u1', bracket: 'upper', round: 1, p1: 'A / B', p2: BYE, isBye: true, winner: 'A / B' },
    { id: 'u2', bracket: 'upper', round: 2, p1: 'A / B', p2: 'C / D', p1FromBye: false }
  ];
  W._inferByeTags(ms);
  ok(ms[1].p1FromBye === false, 'flag persistida pelo gerador VENCE a inferência');
})();

// ── 5. bye SEM vencedor ainda não marca ninguém (nada aconteceu) ─────────────────────────
(function () {
  var ms = [
    { id: 'u1', bracket: 'upper', round: 1, p1: 'A / B', p2: BYE, isBye: true },
    { id: 'u2', bracket: 'upper', round: 2, p1: 'A / B', p2: 'TBD' }
  ];
  W._inferByeTags(ms);
  ok(ms[1].p1FromBye == null, 'bye sem vencedor resolvido não marca a rodada seguinte');
})();

// ── 6. O DEFEITO REAL, medido no HTML do renderer da DUPLA ELIMINATÓRIA ──────────────────
// É este bloco que reprova o código anterior: a chave saía com o card
// "PARTIDA — X vs BYE (Avança Direto)" e sem tag nenhuma na rodada seguinte.
(function () {
  var t = {
    id: 'DE1', name: 'SB', format: 'Dupla Eliminatória', teamSize: 2, currentPhaseIndex: 0,
    participants: [], matches: [
      { id: 'p0-VC-R1-P1', bracket: 'upper', round: 1, phaseIndex: 0, p1: 'Nei / Patrícia', p2: BYE, isBye: true, winner: 'Nei / Patrícia' },
      { id: 'p0-VC-R1-P2', bracket: 'upper', round: 1, phaseIndex: 0, p1: 'Kelly / Rodrigo', p2: 'Vivi / Gersom' },
      { id: 'p0-VC-R2-P1', bracket: 'upper', round: 2, phaseIndex: 0, p1: 'Nei / Patrícia', p2: 'TBD' },
      { id: 'p0-PD-R1-P1', bracket: 'lower', round: 1, phaseIndex: 0, p1: 'TBD', p2: 'TBD' }
    ]
  };
  W.AppStore.tournaments = [t];
  var html = '';
  try { html = String(W.renderDoubleElimBracket(t, true, '') || ''); }
  catch (e) { ok(false, '(6) o renderer da Dupla Eliminatória explodiu: ' + (e && e.message)); }
  ok(html.indexOf('BYE — Avança Direto') === -1,
    '(6) a chave NÃO desenha o card de BYE ("BYE — Avança Direto" fora do HTML)');
  ok(html.indexOf('BYE (Avança Direto)') === -1,
    '(6) nem o rótulo do lado vazio aparece como confronto');
  ok(html.indexOf('Vivi / Gersom') !== -1, '(6) os confrontos VERDADEIROS seguem na tela');
  var m2 = t.matches.find(function (m) { return m.id === 'p0-VC-R2-P1'; });
  ok(m2.p1FromBye === true, '(6) quem passou de bye foi marcado pra levar a tag na rodada seguinte');
})();

console.log((fail ? '❌' : '✅') + ' bye-never-a-card: ' + pass + ' ok, ' + fail + ' falhas');
fails.forEach(f => console.log('   ✗ ' + f));
process.exit(fail ? 1 : 0);

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

// ── 7. NOME da rodada conta só jogos REAIS (bye não é jogo) ──────────────────────────────
// Dono: "quando há 2 jogos na rodada e a próxima é a semifinal, não pode ser quartas de final.
// deve ser rodada x. está considerando ter os 2 jogos com bye aqui provavelmente." Exato.
(function () {
  ok(typeof W._realGameCount === 'function', '(7) existe contagem canônica de jogos reais');
  var col = [
    { id: 'a', p1: 'A / B', p2: 'C / D' },
    { id: 'b', p1: 'E / F', p2: 'G / H' },
    { id: 'c', p1: 'I / J', p2: BYE, isBye: true },
    { id: 'd', p1: 'K / L', p2: BYE, isBye: true }
  ];
  ok(W._realGameCount(col) === 2, '(7) coluna de 2 jogos + 2 byes conta 2 — got ' + W._realGameCount(col));
  ok(W._realGameCount([{ id: 'x', isSitOut: true }]) === 0, '(7) sit-out também não é jogo');
  ok(W._realGameCount([]) === 0 && W._realGameCount(null) === 0, '(7) vazio/nulo não quebra');
})();

// ── 8. BYE ESTRUTURAL: pulou rodada por aresta direta (sem card de bye) ──────────────────
// O caso REAL da chave inferior do dono: 3 vencedores na 1ª inferior, mas a 2ª só tem 1 jogo —
// o 3º vencedor vai DIRETO pra 3ª. A cadência está certa; faltava a tela dizer que é folga.
(function () {
  var ms = [
    { id: 'l1', bracket: 'lower', round: 1, p1: 'A / B', p2: 'C / D', winner: 'A / B', nextMatchId: 'l4', nextSlot: 'p1' },
    { id: 'l2', bracket: 'lower', round: 1, p1: 'E / F', p2: 'G / H', winner: 'E / F', nextMatchId: 'l3', nextSlot: 'p1' },
    { id: 'l3', bracket: 'lower', round: 2, p1: 'E / F', p2: 'TBD' },
    { id: 'l4', bracket: 'lower', round: 3, p1: 'A / B', p2: 'TBD' }   // pulou a rodada 2
  ];
  W._inferByeTags(ms);
  ok(ms[3].p1FromBye === true, '(8) quem PULOU a rodada leva a tag BYE onde aterrissa — got ' + JSON.stringify(ms[3].p1FromBye));
  ok(ms[2].p1FromBye == null, '(8) avanço normal (r1→r2) NÃO leva tag');
})();

// ── 9. QUEDA da superior que aterrissa DEPOIS da 1ª inferior TAMBÉM é folga ──────────────
// Dono, apontando Fernando e Cynara na 3ª inferior: "deveriam estar na r2 inf, mas como estão
// na r3 inf, isso É bye. aplica a tag BYE neles nesse caso." Eles chegam pela aresta de
// DERROTA — que a inferência não seguia; por isso ficavam sem tag.
(function () {
  var ms = [
    { id: 'l1', bracket: 'lower', round: 1, p1: 'X / Y', p2: 'Z / W' },                     // 1ª inferior
    { id: 'u2', bracket: 'upper', round: 2, p1: 'A / B', p2: 'C / D', winner: 'A / B',
      nextMatchId: 'u3', nextSlot: 'p1', loserMatchId: 'l3', loserSlot: 'p2' },
    { id: 'u3', bracket: 'upper', round: 3, p1: 'A / B', p2: 'TBD' },
    { id: 'l3', bracket: 'lower', round: 3, p1: 'TBD', p2: 'C / D' }                        // caiu direto na 3ª
  ];
  W._inferByeTags(ms);
  ok(ms[3].p2FromBye === true,
    '(9) derrotado da 2ª superior aterrissa na 3ª inferior sem ter jogado lá → tag BYE — got ' + JSON.stringify(ms[3].p2FromBye));
  ok(ms[2].p1FromBye == null, '(9) o vencedor seguiu na superior em avanço normal — sem tag');
})();

// ── 10. quem ENTRA na 1ª rodada da chave inferior NÃO leva tag (começou ali) ─────────────
(function () {
  var ms = [
    { id: 'u1', bracket: 'upper', round: 1, p1: 'A / B', p2: 'C / D', winner: 'A / B',
      loserMatchId: 'l1', loserSlot: 'p1' },
    { id: 'l1', bracket: 'lower', round: 1, p1: 'C / D', p2: 'TBD' }
  ];
  W._inferByeTags(ms);
  ok(ms[1].p1FromBye == null, '(10) derrotado da 1ª superior começa na 1ª inferior — não é folga');
})();

console.log((fail ? '❌' : '✅') + ' bye-never-a-card: ' + pass + ' ok, ' + fail + ' falhas');
fails.forEach(f => console.log('   ✗ ' + f));
process.exit(fail ? 1 : 0);

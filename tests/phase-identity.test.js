/* Teste de IDENTIDADE do motor canônico — node tests/phase-identity.test.js
 *
 * Contrato project_unify_initial_phase_canonical, critério 2:
 *   "mesma entrada (mesmo pool + mesma cfg) → a fase inicial e uma fase seguinte
 *    produzem a MESMA estrutura."
 *
 * UM gerador: window._phasesEngine.generatePhase(pool, cfg) → estrutura. Pool-based,
 * SEM dependência de posição (não recebe índice de fase). A Fase N (materializeNextPhase)
 * passa por ele via os wrappers buildPhase* (= _poolFromPrev → genXFromPool).
 *
 * Este teste trava: (1) generatePhase é determinístico/position-agnostic — mesmo pool +
 * mesma cfg → estrutura byte-idêntica, chamado N vezes em qualquer "posição"; (2) o
 * caminho da Fase N (buildPhaseX a partir de uma fase anterior cujo pool É o mesmo)
 * produz a MESMA estrutura que generatePhase recebe direto. Logo: fase inicial (pool =
 * inscritos) ≡ fase seguinte (pool = transição) quando o pool e a cfg são iguais.
 */
const E = require('../js/views/phases-engine.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// normaliza: tira o idPrefix dos ids (ruído de origem) — a ESTRUTURA é o que importa.
function norm(built) {
  function mm(m) {
    // 'main' (rótulo de linha única na Fase N) ≡ sem-rótulo (linha única na Fase 0):
    // é a MESMA chave, só o nome da linha difere → normaliza p/ comparar a estrutura.
    var bk = m.bracket || null; if (bk === 'main') bk = null;
    return {
      round: m.round, bracket: bk, p1: m.p1, p2: m.p2, winner: m.winner,
      groupIdx: (m.groupIdx != null ? m.groupIdx : null), isMonarch: !!m.isMonarch,
      team1: m.team1 || null, team2: m.team2 || null, isBye: !!m.isBye,
      nextSlot: m.nextSlot || null, hasNext: !!m.nextMatchId
    };
  }
  return JSON.stringify({
    matches: (built.matches || []).map(mm),
    leftOut: built.leftOut || null,
    players: built.players || null
  });
}

// pool de N entrantes (objetos team, como buildEntrantsByDest produz)
function mkPool(n) {
  var p = [];
  for (var i = 1; i <= n; i++) p.push({ displayName: 'P' + i, members: [{ name: 'P' + i }] });
  return p;
}

// "fase anterior" cujo pool, após _poolFromPrev, É exatamente `pool` na mesma ordem:
// 1 grupo, standings = pool em ordem (cs identidade). Assim buildPhaseX(prev) usa o
// MESMO pool que generatePhase(pool) — comparável 1:1.
function prevYielding(pool) {
  return [{ name: 'G', players: pool.slice(), standings: pool.map(function (e) { return { displayName: e.displayName, name: e.displayName }; }) }];
}
var csId = function (g) { return g.standings || []; };

function check(label, pool, cfg, builderFromPrev) {
  // (1) determinístico / position-agnostic: 2 chamadas iguais → idênticas
  var a = E.generatePhase(pool, cfg, { idPrefix: 'x' });
  var b = E.generatePhase(pool, cfg, { idPrefix: 'x' });
  ok(norm(a) === norm(b), label + ' — generatePhase determinístico (mesmo pool+cfg → idêntico)');
  // (2) Fase N (buildPhaseX via fase anterior) ≡ generatePhase(pool)
  var prev = prevYielding(pool);
  var faseN = builderFromPrev(prev);
  ok(norm(faseN) === norm(a), label + ' — Fase N (buildPhaseX) ≡ generatePhase(pool) [MESMO gerador]');
  if (norm(faseN) !== norm(a)) {
    var sa = norm(a), sb = norm(faseN);
    for (var i = 0; i < Math.max(sa.length, sb.length); i++) if (sa[i] !== sb[i]) { console.error('    Δ@' + i + ' gen=' + sa.slice(Math.max(0, i - 30), i + 30) + ' | faseN=' + sb.slice(Math.max(0, i - 30), i + 30)); break; }
  }
}

// ── Fase de Grupos (8 → 2 grupos) ──
check('Fase de Grupos (8, 2 grupos)', mkPool(8),
  { formatCode: 'grupos_mata', gruposCount: 2, fixedPairs: false, source: {} },
  function (prev) { return E.buildPhaseGroupStage(prev, { formatCode: 'grupos_mata', gruposCount: 2, fixedPairs: false, source: {} }, csId, 'x'); });

// ── Rei/Rainha (8 → 2 grupos de 4) — modo de sorteio, não formato ──
check('Rei/Rainha (8)', mkPool(8),
  { formatCode: 'grupos_mata', reiRainha: true, source: {} },
  function (prev) { return E.buildPhaseMonarchStage(prev, { formatCode: 'grupos_mata', reiRainha: true, source: {} }, csId, 'x'); });

// ── Pontos Corridos / Liga estático (5) ──
check('Pontos Corridos (5)', mkPool(5),
  { formatCode: 'liga', source: {} },
  function (prev) { return E.buildPhaseLeagueStage(prev, { formatCode: 'liga', source: {} }, csId, 'x'); });

// ── Eliminatória simples (8) — núcleo único genTierBracket ──
check('Eliminatória Simples (8)', mkPool(8),
  { formatCode: 'elim_simples', source: { mapping: [{ dest: 'main', rankFrom: 1, rankTo: 999 }] } },
  function (prev) { return E.buildPhaseBrackets(prev, { formatCode: 'elim_simples', grandFinal: false, fixedPairs: false, source: { mapping: [{ dest: 'main', rankFrom: 1, rankTo: 999 }] } }, csId, 'x-main'); });

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' phase-identity: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);

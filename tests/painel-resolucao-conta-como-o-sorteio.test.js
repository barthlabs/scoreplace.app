/* O PAINEL PROMETE O QUE O SORTEIO ENTREGA (25/ago/2026).
 *
 * O painel de resolução (showUnifiedResolutionPanel) é onde o organizador ESCOLHE entre
 * BYE / repescagem / espera / exclusão, e ele decide olhando "quantos jogos" e "quanto tempo".
 * Esse número saía de uma fórmula PRÓPRIA (⌊s/2⌋ + (lo−1) + s%2) que NÃO era a árvore que o
 * sorteio monta (_buildMinimalElimTree, recorrência Gᵣ=⌈E/2⌉). Medido antes do conserto:
 *   N=20 → prometia 25, o sorteio faz 21
 *   N=25 → prometia 28, o sorteio faz 27
 *   N=33 → prometia 48, o sorteio faz 37  (30% a mais de jogos e de tempo)
 * A dupla eliminatória já fazia certo (_countRepechageDoubleElim ESPELHA o builder); faltava
 * o lado da elim SIMPLES. [[project_minimal_elim_formula_canon]]: "uma fórmula matemática
 * única, sempre a mesma, senão uma hora quebra" — duas contagens divergentes é o que ela proíbe.
 *
 * Este teste compara a conta do painel com a contagem do MOTOR REAL (genTierBracket 'playin')
 * pra N = 3..300. Nada de recalcular a fórmula aqui: uma 3ª cópia seria o mesmo bug de novo.
 */
const fs = require('fs');
const path = require('path');
const { window: W, load } = require('./headless');
load('tournaments-draw-prep.js'); // window._resolucaoJogos (a conta do painel, extraída do closure)
const E = W._phasesEngine;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }

function lo2(n) { let p = 1; while (p * 2 <= n) p *= 2; return p; }
function hi2(n) { let p = 1; while (p < n) p *= 2; return p; }

// A VERDADE: monta a chave de verdade e conta os jogos que vão ser jogados. Exclui o 3º lugar
// (a conta do painel é da chave — o pow2 vale s−1) e os BYEs (ninguém joga um BYE).
function jogosDoSorteio(N) {
  const teams = [];
  for (let i = 1; i <= N; i++) teams.push({ displayName: 'T' + i, uid: 'u' + i });
  const res = E.genTierBracket(teams, 'main', 'p' + N + '-', 'playin', false, 'seed');
  return res.matches.filter((m) => !m.isThirdPlace && !m.isBye).length;
}

function doPainel(N) {
  return W._resolucaoJogos('playin', { effectiveTeams: N, loP2: lo2(N), hiP2: hi2(N) }, {});
}

// ── 1. os três casos MEDIDOS pelo dono (âncoras de regressão, com o número na mão) ──
[[20, 21], [25, 27], [33, 37]].forEach(function (par) {
  const N = par[0], esperado = par[1];
  ok(jogosDoSorteio(N) === esperado, 'N=' + N + ': o sorteio faz ' + esperado + ' jogos (got ' + jogosDoSorteio(N) + ')');
  ok(doPainel(N) === esperado, 'N=' + N + ': o painel PROMETE ' + esperado + ' jogos (got ' + doPainel(N) + ')');
});

// ── 2. a varredura: painel == sorteio pra TODO N de 3 a 300 ──
const divergentes = [];
for (let N = 3; N <= 300; N++) {
  const real = jogosDoSorteio(N), painel = doPainel(N);
  if (painel !== real) divergentes.push(N + ':' + painel + '≠' + real);
}
ok(divergentes.length === 0, 'N=3..300: painel == sorteio (divergem em ' + divergentes.length +
  ': ' + divergentes.slice(0, 12).join(' ') + (divergentes.length > 12 ? ' …' : '') + ')');

// ── 3. potência de 2 = N−1 exato (a chave limpa, sem repescagem nenhuma) ──
[4, 8, 16, 32, 64, 128, 256].forEach(function (N) {
  ok(doPainel(N) === N - 1, 'N=' + N + ' (pow2): ' + (N - 1) + ' jogos (got ' + doPainel(N) + ')');
});

// ── 4. as OUTRAS opções do painel não mudaram (o conserto é só do ramo da repescagem) ──
const info33 = { effectiveTeams: 33, loP2: 32, hiP2: 64 };
ok(W._resolucaoJogos('bye', info33, {}) === 32, 'bye: s−1');
ok(W._resolucaoJogos('reopen', info33, {}) === 63, 'reopen: hi−1');
ok(W._resolucaoJogos('standby', info33, {}) === 31, 'standby: lo−1');
ok(W._resolucaoJogos('exclusion', info33, {}) === 31, 'exclusion: lo−1');
ok(W._resolucaoJogos('swiss', info33, { swissRounds: 6, swissElim: 31 }) === 6 * 16 + 31, 'swiss: X rodadas + eliminatória');
ok(W._resolucaoJogos('dissolve', info33, {}) === null, 'dissolve: sem estimativa direta');
ok(W._resolucaoJogos('poll', info33, {}) === null, 'poll: sem estimativa direta');
ok(W._resolucaoJogos('playin', { effectiveTeams: 1, loP2: 1, hiP2: 1 }, {}) === null, 's<=1: sem estimativa');
// transição de FASE: a MESMA estratégia roda em cada linha → multiplica pelo nº de linhas.
ok(W._resolucaoJogos('playin', info33, { lines: 2 }) === 2 * jogosDoSorteio(33), 'fase com 2 linhas: dobra');
// DUPLA eliminatória continua no contador dela (_countRepechageDoubleElim), não neste.
load('tournaments-draw.js');
ok(typeof W._countRepechageDoubleElim === 'function', '_countRepechageDoubleElim existe (lado da DUPLA)');
ok(W._resolucaoJogos('playin', { effectiveTeams: 14, loP2: 8, hiP2: 16 }, { isDouble: true })
   === W._countRepechageDoubleElim(14), 'dupla: usa o contador da dupla, não o da simples');

// ── 5. o TEMPO passa pela régua por SET (window._minutosDaPartida, 2.0.74) ──
// A contagem consertada só vale se ela ainda for multiplicada pela duração REAL da partida
// daquela fase. Checagem no FONTE porque o cálculo mora dentro do painel (precisa de DOM).
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-draw-prep.js'), 'utf8');
ok(/_uDur\s*=\s*window\._minutosDaPartida\(t,\s*window\._faseDoTorneio\(/.test(src),
  'painel: duração vem de _minutosDaPartida(t, fase) — régua por SET');
ok(/Math\.ceil\(g\s*\/\s*Math\.max\(1,\s*_uCourts\)\)\s*\*\s*_uDur/.test(src),
  'painel: tempo = ⌈jogos/quadras⌉ × _uDur (a contagem corrigida passa por ela)');
ok(/_uGamesFor\s*=\s*function[\s\S]{0,400}window\._resolucaoJogos\(/.test(src),
  'painel: _uGamesFor delega pra window._resolucaoJogos (uma conta só)');

console.log((fail ? '✗' : '✓') + ' painel-resolucao-conta-como-o-sorteio: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);

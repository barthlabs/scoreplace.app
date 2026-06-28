/* Matriz ADVERSÁRIA do motor de fases — node tests/phase-adversarial.test.js
 *
 * NÃO é caminho feliz. Joga de propósito os casos que quebram torneio ao vivo:
 * ímpar, não-potência-de-2, empate na classificação, grupo minúsculo, mapeamento
 * fora de faixa, fase INCOMPLETA. Invariante mínima inegociável: nenhum jogador
 * SOME silenciosamente e nenhum entra DUAS vezes — mesmo em entrada torta. E o
 * motor NÃO pode avançar uma fase que não terminou.
 *
 * Reporta o que achar (falha = bug real, não maquiar pra passar).
 */
const { window: W, E } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
const cs = (g) => g.standings;
const sortedEq = (a, b) => JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());
function membersOf(e) {
  if (e.p2Name) return [e.p1Name, e.p2Name];
  const dn = e.displayName || e.name || '';
  if (dn.indexOf(' / ') !== -1) return dn.split(' / ').map((s) => s.trim());
  return [dn];
}
function stand(names, winsFn) { return { standings: names.map((n, i) => ({ name: n, wins: winsFn ? winsFn(i) : (names.length - i) })) }; }
function membersAll(byDest, keys) {
  return keys.reduce((acc, k) => acc.concat((byDest[k] || []).reduce((a, e) => a.concat(membersOf(e)), [])), []);
}

// ── A. ÍMPAR + dupla fixa: 5 jogadores, fixedPairs=true. Não pode perder o 5º ──
(function () {
  const all = ['P1', 'P2', 'P3', 'P4', 'P5'];
  const mp = [{ dest: 'main', rankFrom: 1, rankTo: 999 }];
  let r; try { r = E.buildEntrantsByDest([stand(all)], mp, true, cs, 'top'); } catch (e) { ok(false, 'A ímpar+dupla LANÇOU: ' + e.message); return; }
  const got = membersAll(r, ['main']);
  ok(sortedEq(got, all), 'A: 5 ímpar + dupla fixa — ninguém some [veio ' + got.sort().join(',') + ']');
  ok(new Set(got).size === got.length, 'A: 5 ímpar — sem duplicata');
})();

// ── B. EMPATE DE CLASSIFICAÇÃO (não de jogo): vitórias [2,2,1,1] ──────────────
// App não tem empate EM JOGO (todo jogo tem vencedor), mas empate em vitórias na
// tabela é real e resolvido por tiebreakers. Invariante: ninguém some/duplica.
(function () {
  const all = ['E1', 'E2', 'E3', 'E4'];
  const mp = [{ dest: 'main', rankFrom: 1, rankTo: 999 }];
  let r; try { r = E.buildEntrantsByDest([stand(all, (i) => (i < 2 ? 2 : 1))], mp, false, cs, 'top', { scope: 'overall' }); } catch (e) { ok(false, 'B empate-class LANÇOU: ' + e.message); return; }
  const got = membersAll(r, ['main']);
  ok(sortedEq(got, all), 'B: empate de classificação [2,2,1,1] — todos os 4 avançam [veio ' + got.sort().join(',') + ']');
  ok(new Set(got).size === got.length, 'B: empate de classificação — sem duplicata');
})();

// ── C. MINÚSCULO: 2 jogadores, 1 grupo, dupla fixa ───────────────────────────
(function () {
  const all = ['S1', 'S2'];
  const mp = [{ dest: 'main', rankFrom: 1, rankTo: 999 }];
  let r; try { r = E.buildEntrantsByDest([stand(all)], mp, true, cs, 'top'); } catch (e) { ok(false, 'C 2-jogadores LANÇOU: ' + e.message); return; }
  const got = membersAll(r, ['main']);
  ok(sortedEq(got, all), 'C: 2 jogadores viram 1 dupla, ninguém some');
})();

// ── D. GRUPOS DE TAMANHO DESIGUAL: A=4, B=3 (7 total) ────────────────────────
(function () {
  const A = ['A1', 'A2', 'A3', 'A4'], B = ['B1', 'B2', 'B3'];
  const mp = [{ dest: 'main', rankFrom: 1, rankTo: 999 }];
  let r; try { r = E.buildEntrantsByDest([stand(A), stand(B)], mp, false, cs, 'top'); } catch (e) { ok(false, 'D grupos desiguais LANÇOU: ' + e.message); return; }
  const got = membersAll(r, ['main']);
  ok(sortedEq(got, A.concat(B)), 'D: grupos 4+3 — todos os 7 avançam [veio ' + got.sort().join(',') + ']');
})();

// ── E. MAPEAMENTO FORA DE FAIXA: 3 jogadores, pede rankTo 8 ──────────────────
(function () {
  const all = ['M1', 'M2', 'M3'];
  const mp = [{ dest: 'main', rankFrom: 1, rankTo: 8 }];
  let r; try { r = E.buildEntrantsByDest([stand(all)], mp, false, cs, 'top'); } catch (e) { ok(false, 'E over-range LANÇOU: ' + e.message); return; }
  const got = membersAll(r, ['main']);
  ok(sortedEq(got, all), 'E: rankTo>disponível — só os 3 reais, sem fantasma [veio ' + got.sort().join(',') + ']');
  ok(new Set(got).size === got.length, 'E: over-range — sem duplicata');
})();

// ── F. FASE com jogo pendente NÃO avança (regra dura, manual e auto) ─────────
// Confirmado pelo dono: fase NÃO avança com jogo pendente — entre rodadas ok, entre
// FASES não. A guarda phaseComplete vive em advanceMultiPhase (materializeNextPhase é
// interno, não-guardado). Verificado: nenhum caminho servidor/auto-draw avança fase.
// FALTA (pós-freeze): UI pro organizador resolver os pendentes (WO todos / permitir
// jogar) — ver memória project_autodraw_phase_pending_game. Aqui travamos o bloqueio.
(function () {
  function grp(names, w) { return { players: names.map((n) => ({ name: n })), matches: [{ p1: names[0], p2: names[1], winner: w ? names[0] : null }] }; }
  const phases = [
    { name: 'Grupos', formatCode: 'grupos_mata', source: { type: 'enrollment' } },
    { name: 'Elim', formatCode: 'elim_simples', source: { type: 'previous_phase', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 1 }] }, fixedPairs: false },
  ];
  // negativo: grupo B com jogo SEM resultado → não avança
  const tInc = { id: 'inc', currentPhaseIndex: 0, matches: [], groups: [grp(['A1', 'A2'], true), grp(['B1', 'B2'], false)], phases: JSON.parse(JSON.stringify(phases)) };
  W.AppStore = { tournaments: [tInc] }; W.__alert = null; W.showAlertDialog = (title) => { W.__alert = title; };
  W._advanceMultiPhase('inc');
  ok(tInc.currentPhaseIndex === 0 && (tInc.matches || []).length === 0, 'F-neg: jogo sem resultado → avanço manual NÃO acontece (índice/matches intactos)');
  ok(/incompleta/i.test(W.__alert || ''), 'F-neg: organizador é avisado "Fase incompleta"');

  // positivo: todos os jogos com vencedor → avança (índice sobe pra 1)
  const tOk = { id: 'ok', currentPhaseIndex: 0, matches: [], groups: [grp(['A1', 'A2'], true), grp(['B1', 'B2'], true)], phases: JSON.parse(JSON.stringify(phases)) };
  W.AppStore = { tournaments: [tOk] }; W.__alert = null;
  W._advanceMultiPhase('ok');
  ok(tOk.currentPhaseIndex === 1, 'F-pos: fase completa avança (índice→1) [veio ' + tOk.currentPhaseIndex + ']');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' phase-adversarial: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);

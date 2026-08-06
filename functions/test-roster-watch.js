'use strict';
/* Vigia estrutural — o servidor separa autoridade de acidente SEM saber quem escreveu.
 * Roda o CÓDIGO REAL (roster-watch-core), o mesmo que o gatilho chama. */
const { detectarTrocaDeEscalacao } = require('./roster-watch-core.js');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };
console.log('\n──── vigia estrutural (observação) ────');

const J = (id, t1, t1u) => ({ id, p1: t1.join(' / '), p2: 'C / D', team1: t1, team1Uids: t1u,
                              team2: ['C', 'D'], team2Uids: ['u-c', 'u-d'] });
const T = (ms, rev) => { const t = { rounds: [{ round: 1, matches: ms }] };
                         if (rev != null) t.rosterRev = rev; return t; };

// ── 1 · cliente VELHO devolve escalação antiga (o caso que motivou o vigia) ──
{
  const antes  = T([J('m1', ['SUPLENTE', 'B'], ['u-sup', 'u-b'])], 3);
  const depois = T([J('m1', ['AUSENTE', 'B'], ['u-aus', 'u-b'])], 3);   // contador PARADO
  const r = detectarTrocaDeEscalacao(antes, depois);
  ok(r.suspeitos.length === 1, 'troca sem o contador é sinalizada');
  ok(r.suspeitos[0].id === 'm1', 'e diz QUAL jogo');
  ok(/SEM contador/.test(r.motivo), 'o motivo aponta cliente sem os guards');
}

// ── 2 · W.O. legítimo (autoridade) passa limpo ──────────────────────────────
{
  const antes  = T([J('m1', ['AUSENTE', 'B'], ['u-aus', 'u-b'])], 3);
  const depois = T([J('m1', ['SUPLENTE', 'B'], ['u-sup', 'u-b'])], 4);  // contador SUBIU
  const r = detectarTrocaDeEscalacao(antes, depois);
  ok(r.suspeitos.length === 0 && r.motivo === 'troca declarada', 'W.O. declarado não é sinalizado');
}

// ── 3 · primeira troca da vida (banco ainda sem contador) ───────────────────
{
  const antes  = T([J('m1', ['A', 'B'], ['u-a', 'u-b'])]);              // sem rosterRev
  const depois = T([J('m1', ['Z', 'B'], ['u-z', 'u-b'])], 1);
  const r = detectarTrocaDeEscalacao(antes, depois);
  ok(r.suspeitos.length === 0, 'primeira troca (0 → 1) conta como declarada');
}

// ── 4 · ACRESCENTAR jogo é legítimo — é o que o fecho de rodada faz ─────────
{
  const antes  = T([J('m1', ['A', 'B'], ['u-a', 'u-b'])], 2);
  const depois = T([J('m1', ['A', 'B'], ['u-a', 'u-b']), J('novo', ['E', 'F'], ['u-e', 'u-f'])], 2);
  const r = detectarTrocaDeEscalacao(antes, depois);
  ok(r.suspeitos.length === 0 && r.jogosNovos === 1, 'acrescentar rodada/jogo não é sinalizado');
}

// ── 5 · lançar PLACAR não mexe em escalação ────────────────────────────────
{
  const a = J('m1', ['A', 'B'], ['u-a', 'u-b']);
  const d = Object.assign({}, a, { scoreP1: 6, scoreP2: 3, winner: 'A / B' });
  const r = detectarTrocaDeEscalacao(T([a], 2), T([d], 2));
  ok(r.suspeitos.length === 0 && r.motivo === 'sem troca', 'lançar placar passa limpo (é o caminho quente)');
}

// ── 6 · identidade por UID, não por nome ───────────────────────────────────
// Nome de entrada com uid é STRIPADO no save (v1.3.52) — comparar por nome não veria.
{
  const a = { id: 'm1', p1: null, p2: null, team1Uids: ['u-a', 'u-b'], team2Uids: ['u-c', 'u-d'] };
  const d = { id: 'm1', p1: null, p2: null, team1Uids: ['u-OUTRO', 'u-b'], team2Uids: ['u-c', 'u-d'] };
  const r = detectarTrocaDeEscalacao(T([a], 2), T([d], 2));
  ok(r.suspeitos.length === 1, 'troca vista pelo UID mesmo com nome vazio no doc');
}

// ── 7 · entradas defensivas: gatilho não pode derrubar escrita nenhuma ─────
{
  ok(detectarTrocaDeEscalacao(null, null).suspeitos.length === 0, 'docs ausentes não quebram o vigia');
  ok(detectarTrocaDeEscalacao({}, { rounds: 'nada' }).suspeitos.length === 0, 'formas inesperadas não quebram');
}

// ── 8 · MODO OBSERVAÇÃO: o módulo não propõe escrita nenhuma ───────────────
{
  const r = detectarTrocaDeEscalacao(T([J('m1', ['S', 'B'], ['u-s', 'u-b'])], 3),
                                     T([J('m1', ['A', 'B'], ['u-a', 'u-b'])], 3));
  ok(!('updateData' in r) && !('revert' in r), 'o vigia só DESCREVE — nada de reverter nesta fase');
}

console.log('\n' + (fail ? '❌' : '✅') + ' vigia: ' + pass + ' ok, ' + fail + ' falha(s)');
if (fail) process.exit(1);

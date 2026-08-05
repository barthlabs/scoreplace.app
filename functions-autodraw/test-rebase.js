'use strict';
/* O SERVIDOR não apaga o que aconteceu na quadra enquanto ele pensava.
 *
 * Roda o CÓDIGO REAL (`rebase-core.js`, o mesmo que o autoDraw chama dentro da
 * transação) — não uma réplica. Contra o comportamento anterior (gravar
 * `rounds: t.rounds` cru) o primeiro caso fica vermelho: o placar some.
 */
const { rebaseRounds } = require('./rebase-core.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }
console.log('\n──── autoDraw: rebase (o placar da quadra vence) ────');

const J = (id, a, b, w) => ({ id, p1: 'A', p2: 'B', scoreP1: a, scoreP2: b, winner: w || null });

// ── 1 · placar lançado ENQUANTO o servidor sorteava ─────────────────────────
{
  // o servidor LEU a rodada 1 sem placar…
  const lido = [{ round: 1, matches: [J('m1', null, null)] }];
  // …e o motor acrescentou a rodada 2
  const doMotor = lido.concat([{ round: 2, matches: [J('n1', null, null)] }]);
  // no meio tempo alguém lançou 6x3 na rodada 1 (é o que está no banco AGORA)
  const fresco = [{ round: 1, matches: [J('m1', 6, 3, 'A')] }];

  const r = rebaseRounds(fresco, doMotor, lido.length);
  ok(r.rounds.length === 2, 'a rodada nova entra');
  ok(r.rounds[0].matches[0].scoreP1 === 6 && r.rounds[0].matches[0].scoreP2 === 3,
     'o placar lançado na quadra NÃO é apagado pelo servidor');
  ok(r.rounds[0].matches[0].winner === 'A', 'e o vencedor fica');
  ok(r.rounds[1].round === 2, 'a rodada 2 é a contribuição do sorteio');
  ok(r.acrescentadas === 1 && r.descartadas === 0, 'contabilidade do rebase bate');
}

// ── 2 · retry da transação não duplica a rodada ─────────────────────────────
// A transação pode re-executar por conflito de versão. Na 2ª passada o doc fresco
// JÁ tem a rodada nova — sem dedup, ela entraria duas vezes.
{
  const lido = [{ round: 1, matches: [J('m1', null, null)] }];
  const doMotor = lido.concat([{ round: 2, matches: [J('n1', null, null)] }]);
  const frescoJaComR2 = [{ round: 1, matches: [J('m1', 6, 3, 'A')] }, { round: 2, matches: [J('n1', null, null)] }];

  const r = rebaseRounds(frescoJaComR2, doMotor, lido.length);
  ok(r.rounds.length === 2, 'retry não duplica a rodada');
  ok(r.descartadas === 1, 'e diz que descartou a repetida');
}

// ── 3 · PRIMEIRO sorteio (doc sem rodada nenhuma) ──────────────────────────
{
  const doMotor = [{ round: 1, matches: [J('m1', null, null)] }];
  const r = rebaseRounds([], doMotor, 0);
  ok(r.rounds.length === 1 && r.acrescentadas === 1, 'primeiro sorteio grava a rodada 1');
}

// ── 4 · rodada acrescentada por OUTRO caminho no meio tempo não é perdida ───
// (fecho de rodada pelo cliente enquanto o servidor pensava)
{
  const lido = [{ round: 1, matches: [J('m1', null, null)] }];
  const doMotor = lido.concat([{ round: 3, matches: [J('n3', null, null)] }]);
  const fresco = [{ round: 1, matches: [J('m1', 6, 3, 'A')] }, { round: 2, matches: [J('c2', null, null)] }];

  const r = rebaseRounds(fresco, doMotor, lido.length);
  ok(r.rounds.length === 3, 'a rodada criada por outro caminho sobrevive junto');
  ok(r.rounds.map(x => x.round).join(',') === '1,2,3', 'e a ordem das rodadas fica coerente');
}

// ── 5 · entradas defensivas (doc novo, campo ausente) ──────────────────────
{
  const r = rebaseRounds(null, null, 0);
  ok(Array.isArray(r.rounds) && r.rounds.length === 0, 'entradas ausentes não derrubam o sorteio');
  const r2 = rebaseRounds(undefined, [{ round: 1 }], -5);
  ok(r2.rounds.length === 1, 'roundsAntes inválido não perde a rodada gerada');
}

console.log('\n' + (fail ? '❌' : '✅') + ' rebase: ' + pass + ' ok, ' + fail + ' falha(s)');
if (fail) process.exit(1);

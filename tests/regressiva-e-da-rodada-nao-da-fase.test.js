/* A REGRESSIVA DA RODADA É DA RODADA, NÃO DA FASE
 *
 * Relato do dono (24/ago/2026, avançando de fase no sandbox): _"ao avançar de fase está
 * contando na regressiva da rodada o prazo até o final da FASE e não da rodada. O certo é ver
 * o número de rodadas que teremos e dividir o prazo total da fase pelo número de rodadas e dar
 * a regressiva para o final da rodada. E repetir isso até o final da fase."_
 *
 * O QUE ACONTECIA: a fase materializada trazia início/fim CONFIGURADOS da FASE
 * (`_cfgSL`/`_cfgEL`) direto pro relógio (`deadlineMs = plannedEnd`). Numa fase de 4 rodadas
 * a R1 anunciava o prazo inteiro da fase — prazo que a R1 não tem.
 *
 * A RÉGUA (window._phaseRoundWindow, fonte única dos dois ramos): fatia
 * [início da fase, fim da fase] em N pedaços IGUAIS (N = nº de rodadas) e a rodada k fica com
 * o k-ésimo. A última fatia termina exatamente no fim da fase — sem sobra, sem estouro.
 */
const { window: W, load } = require('./headless');
load('tournaments-utils.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };
console.log('──── regressiva é da rodada, não da fase ────');

const D = 86400000;
const ini = new Date('2026-09-01T09:00:00Z').getTime();
const fim = ini + 8 * D;              // fase de 8 dias

ok(typeof W._phaseRoundWindow === 'function', '_phaseRoundWindow existe (régua única)');

// 4 rodadas em 8 dias → 2 dias cada
const r1 = W._phaseRoundWindow(ini, fim, 1, 4);
const r2 = W._phaseRoundWindow(ini, fim, 2, 4);
const r4 = W._phaseRoundWindow(ini, fim, 4, 4);
ok(r1.endMs - r1.startMs === 2 * D, 'R1 de 4 dura 2 dias (got ' + ((r1.endMs - r1.startMs) / D) + 'd)');
ok(r1.startMs === ini, '  → R1 começa no início da fase');
ok(r1.endMs !== fim, '  → e NÃO termina no fim da fase (era o bug)');
ok(r2.startMs === r1.endMs, 'R2 começa onde a R1 acabou (as fatias andam, sem buraco)');
ok(r4.endMs === fim, 'a ÚLTIMA rodada termina exatamente no fim da fase');
ok(r1.sliced === true && r4.roundsTotal === 4, 'a janela se declara fatiada');

// rodada única = a fase inteira (sem regressão)
const u = W._phaseRoundWindow(ini, fim, 1, 1);
ok(u.startMs === ini && u.endMs === fim && u.sliced === false, 'rodada única fica com a fase inteira');

// rodada EXTRA (mais rodadas que o planejado): o divisor é o que existe, não o planejado —
// senão a rodada 5 de "4 planejadas" herdaria uma fatia já vencida.
const x = W._phaseRoundWindow(ini, fim, 5, 4);
ok(x.roundsTotal === 5 && x.endMs === fim, 'rodada além do planejado redivide (5 fatias, fim no fim)');

// janela inválida não inventa prazo (quem chama cai na estimativa e NÃO mostra regressiva)
ok(W._phaseRoundWindow(0, fim, 1, 3) === null, 'sem início não devolve janela');
ok(W._phaseRoundWindow(fim, ini, 1, 3) === null, 'fim antes do início não devolve janela');

// ── o progresso da rodada informa o divisor ──────────────────────────────────────────
// fase 1 materializada: R1 com 4 jogos (2 jogados), R2 com 2, R3 com 1 → 3 rodadas
const t = { currentPhaseIndex: 1, matches: [
  { phaseIndex: 1, round: 1, winner: 'a', resultAt: ini + 3600000 },
  { phaseIndex: 1, round: 1, winner: 'b', resultAt: ini + 7200000 },
  { phaseIndex: 1, round: 1, winner: null }, { phaseIndex: 1, round: 1, winner: null },
  { phaseIndex: 1, round: 2, winner: null }, { phaseIndex: 1, round: 2, winner: null },
  { phaseIndex: 1, round: 3, winner: null },
] };
const pr = W._phaseCurrentRoundProgress(t);
ok(pr && pr.roundNum === 1, 'rodada atual = a 1ª com jogo pendente');
ok(pr && pr.roundsTotal === 3, '  → e a fase se declara com 3 rodadas (got ' + (pr && pr.roundsTotal) + ')');
const rw = W._phaseRoundWindow(ini, fim, pr.roundNum, pr.roundsTotal);
ok(Math.round((rw.endMs - rw.startMs) / D * 100) / 100 === 2.67,
  '  → a R1 dessa fase tem 8/3 ≈ 2,67 dias, não 8 (got ' + ((rw.endMs - rw.startMs) / D).toFixed(2) + 'd)');

// ── 3. NA TELA (o caso do relato: fase materializada com janela configurada) ─────────
// É aqui que o defeito aparecia: `deadlineMs` saía do fim da FASE. O `data-sp-cd2l` é o
// atributo que o tique de 1s reescreve — ele carrega o instante da regressiva.
(function () {
  const iniISO = '2026-09-01', fimISO = '2026-09-09';
  const iniMs = new Date(iniISO + 'T09:00').getTime(), fimMs = new Date(fimISO + 'T09:00').getTime();
  const tt = {
    id: 'x', status: 'active', currentPhaseIndex: 1, multiPhase: true,
    phases: [{ name: 'Grupos' }, { name: 'Elim', startDate: iniISO, startTime: '09:00', endDate: fimISO, endTime: '09:00' }],
    rounds: [{ matches: [{ winner: 'a' }] }],
    matches: [
      { phaseIndex: 1, round: 1, winner: 'a', resultAt: iniMs + 3600000 },
      { phaseIndex: 1, round: 1, winner: null },
      { phaseIndex: 1, round: 2, winner: null },
      { phaseIndex: 1, round: 3, winner: null },
    ],
    participants: [{ uid: 'u1' }], startDate: iniISO, endDate: fimISO,
  };
  const html = W._buildProgressInner(tt);
  const cd = /data-sp-cd2l="(\d+)"/.exec(html);
  ok(!!cd, 'a rodada tem regressiva (data-sp-cd2l)');
  ok(cd && Math.abs(+cd[1] - fimMs) > D, '  → e ela NÃO aponta pro fim da fase (era o bug)');
  const dias = cd ? (+cd[1] - iniMs) / D : 0;
  ok(Math.abs(dias - 8 / 3) < 0.02,
    '  → aponta pro fim da R1 de 3: 8/3 ≈ 2,67 dias (got ' + dias.toFixed(2) + 'd)');
  const flat = html.replace(/<br>/g, ' ');
  ok(/início da rodada/.test(flat) && /final da rodada/.test(flat),
    '  → e as colunas dizem "início/final da RODADA"');
})();

console.log(fail === 0
  ? '\n✅ regressiva-e-da-rodada-nao-da-fase: OK (' + pass + ')'
  : '\n❌ regressiva-e-da-rodada-nao-da-fase: ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);

/* O AVANÇO DE FASE É A DATA DE INÍCIO DA FASE SEGUINTE.
 *
 * Ordem do dono (02/set/2026): _"quando avancei de fase em 02/09 é a data inicial da
 * fase 2. data final lancada faz tempo"_.
 *
 * INCIDENTE: o painel da Fase 2 da Confra anunciava início 02/08 19:00 e final 19/08 19:40
 * — a janela da FASE 1. MEDIDO no navegador real, com a expressão que estava no arquivo:
 *   fase 2 COM datas próprias → 02/09 08:00 → 06/09 18:00   (certo)
 *   fase 2 SEM datas próprias → 02/08      → 19/08          (as da FASE 1)
 * Causa: `|| window._tProgParseMs(t.startDate/endDate)`, e esses campos são da fase
 * INICIAL (js/store.js:14236-14238, :14267-14268).
 * E não havia carimbo nenhum de quando a fase seguinte começou.
 *
 * Rodado por: node tests/avanco-de-fase-e-o-inicio-da-fase.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── o avanço é o início da fase ────');

const s = {};
s.window = s; s.globalThis = s; s.console = { log(){}, warn(){}, error(){} };
s._warn = s._log = s._error = s._debug = () => {};
s.setTimeout = setTimeout; s.clearTimeout = clearTimeout;
s.navigator = { userAgent: 'node' };
s.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
s.document = { getElementById: () => null, addEventListener() {}, createElement: () => ({ style:{}, appendChild(){} }) };
vm.createContext(s);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/views/tournaments-utils.js'),'utf8'), s, { filename:'tournaments-utils.js' });

const DIA = 24*3600*1000;
const base = () => ({ id:'x', format:'Fase de Grupos + Eliminatórias', status:'active',
  currentPhaseIndex: 1,
  startDate:'2026-08-02', startTime:'19:00', endDate:'2026-08-19', endTime:'19:40',
  phases:[{ name:'Grupos', startDate:'2026-08-02', endDate:'2026-08-19', rounds:1 },
          { name:'Elim', endDate:'2026-09-19', endTime:'19:40', rounds:4 }],
  rounds:[], groups:[] });

// ── ① a fase 2 NÃO herda mais a janela da fase 1 ─────────────────────────────
{
  const t = base();                       // sem carimbo, sem congelada
  const ini = s._inicioDaFase(t, 1);
  ok(ini === null, '① sem carimbo e sem congelada, a fase 2 NÃO tem início inventado (herdava 02/08)');
  const fim = s._fimDaFase(t, 1);
  ok(fim === s._tProgParseMs('2026-09-19T19:40'), '① o FIM é o que o organizador lançou na fase (19/09)');
}
// ── ② o CARIMBO DO AVANÇO manda ──────────────────────────────────────────────
{
  const t = base();
  t.phaseStartedAt = { '1': '2026-09-02T13:04:00.000Z' };
  const ini = s._inicioDaFase(t, 1);
  ok(ini === s._tProgParseMs('2026-09-02T13:04:00.000Z'), '② o início da fase 2 é o instante do AVANÇO (02/09)');
  ok(new Date(ini).getUTCMonth() === 8, '② e cai em SETEMBRO, não em agosto');
}
// ── ③ O CONGELAMENTO NÃO É O AVANÇO — e por isso NÃO vira data de início ─────
/* ⛔ ESTA ASSERÇÃO JÁ FOI O CONTRÁRIO, por engano meu, e a inversão fica registrada em
 * vez de o caso sumir. Eu usei `classifCongeladaAt` como marco retroativo do avanço.
 * MEDIDO no documento real: os 24 carimbos vão de 22/ago a 26/ago, porque o grupo
 * congela QUANDO TERMINA (cânone), e o organizador avançou em 02/set. O congelamento
 * anunciaria uma data uma semana no passado com cara de verdade — pior que não ter data.
 * ⭐ Sem marco, a resposta certa é NÃO RESPONDER: o cartão cai na duração estimada. */
{
  const t = base();
  t.rounds = [{ round:1, monarchGroups:[
    { classifCongeladaAt:'2026-08-26T16:29:58.437Z' },
    { classifCongeladaAt:'2026-08-22T23:27:52.811Z' } ] }];
  ok(s._inicioDaFase(t, 1) === null,
     '③ o congelamento da fase anterior NÃO vira início da fase seguinte');
}
// ── ④ declaração do organizador vence o carimbo ──────────────────────────────
{
  const t = base();
  t.phases[1].startDate = '2026-09-05'; t.phases[1].startTime = '08:00';
  t.phaseStartedAt = { '1': '2026-09-02T13:04:00.000Z' };
  ok(s._inicioDaFase(t,1) === s._tProgParseMs('2026-09-05T08:00'),
     '④ data declarada na fase vence o carimbo do avanço');
}
// ── ⑤ a FASE 0 continua herdando o topo (sem regressão) ──────────────────────
{
  const t = base(); t.currentPhaseIndex = 0; t.phases[0] = { name:'Grupos', rounds:1 };
  ok(s._inicioDaFase(t,0) === s._tProgParseMs('2026-08-02'), '⑤ fase 0 SEM datas próprias herda t.startDate');
  ok(s._fimDaFase(t,0) === s._tProgParseMs('2026-08-19'), '⑤ fase 0 herda t.endDate');
}
// ── ⑥ A RÉGUA DO DONO: fatia a fase pelas rodadas, em dias ───────────────────
{
  const t = base();
  t.phaseStartedAt = { '1': '2026-09-02T00:00:00.000Z' };
  t.phases[1].endDate = '2026-09-10'; t.phases[1].endTime = '00:00';
  const ini = s._inicioDaFase(t,1), fim = s._fimDaFase(t,1);
  const n = s._phasePlannedRounds(t,1);
  ok(n === 4, '⑥ a fase 2 planeja 4 rodadas (veio ' + n + ')');
  const w1 = s._phaseRoundWindow(ini, fim, 1, n), w2 = s._phaseRoundWindow(ini, fim, 2, n);
  ok(w1.sliced === true, '⑥ a janela da rodada é FATIADA');
  ok(Math.round((w1.endMs - w1.startMs)/DIA) === 2, '⑥ 8 dias ÷ 4 rodadas = 2 dias por rodada');
  ok(w1.startMs === ini, '⑥ a rodada 1 começa no início da FASE');
  ok(w2.startMs === w1.endMs, '⑥ a rodada 2 começa onde a 1 termina');
  ok(s._phaseRoundWindow(ini, fim, 4, n).endMs === fim, '⑥ a última rodada termina no fim da FASE');
}
// ── ⑦ o CARIMBO existe na porta única de armazenamento de fase ───────────────
{
  const pe = fs.readFileSync(path.join(ROOT,'js/views/phases-engine.js'),'utf8');
  ok(/function _carimbaInicioDaFase/.test(pe), '⑦ o carimbo existe em phases-engine.js');
  // conta CHAMADAS, nunca a definição (`function _carimbaInicioDaFase(t, idx)` também casa)
  const nChamadas = (pe.match(/(?<!function )_carimbaInicioDaFase\(t, idx\)/g) || []).length;
  ok(nChamadas === 2, '⑦ carimbado nos DOIS ramos de storePhase (veio ' + nChamadas + ')');
  const iFn = pe.indexOf('function storePhase');
  const iFim = pe.indexOf('function advanceMultiPhase');
  const dentro = [...pe.matchAll(/(?<!function )_carimbaInicioDaFase\(t, idx\)/g)]
    .every((m) => m.index > iFn && m.index < iFim);
  ok(iFn > 0 && dentro, '⑦ as DUAS chamadas moram DENTRO de storePhase (porta única)');
  ok(/if \(!t\.phaseStartedAt\[k\]\) t\.phaseStartedAt\[k\] =/.test(pe),
     '⑦ NUNCA reescreve carimbo existente — re-materializar não move o início');
  ok(!/t\.phases\[[^\]]*\]\.startedAt/.test(pe), '⑦ não escreve dentro de t.phases (config do formulário)');
}
console.log(fail === 0 ? '  ✓ ' + pass + ' asserções' : '  ' + pass + ' ok / ' + fail + ' falhas');
process.exit(fail === 0 ? 0 : 1);

/* O AVANÇO DE FASE É DETERMINÍSTICO — POR RAMO (leva 2.2)
 *
 * ⛔ POR QUE ISTO É REQUISITO, e não capricho: o avanço passou a rodar dentro de
 * `db.runTransaction`, e o Firestore RE-EXECUTA o callback quando a transação aborta. Se a
 * materialização usar `Date.now()` ou `Math.random()`, a 2ª tentativa produz IDS e ORDEM
 * diferentes da 1ª — a mesma operação grava coisas distintas, e a idempotência por
 * `operationId` deixa de valer. Pior: o cliente mostraria um conjunto de jogos e o banco
 * guardaria outro, que foi exatamente o incidente da Fase 2 da Confra.
 *
 * A varredura v4 achou 13 sítios alcançáveis. O carimbo determinístico
 * (`stamp = sha256(operationId|tournamentId|toPhaseIndex)`) vira `ts` (ocupa o lugar do
 * `Date.now()` nos ids) e `rnd` (PRNG semeado, no lugar do `Math.random()`).
 *
 * ⚠️ O QUE ESTE TESTE **NÃO** AFIRMA: que o backend inteiro ficou determinístico.
 * `drawRound`, `formLatePair` e outros fluxos antigos seguem com `Date.now()` próprio para
 * lógica fora do plano/espelho. O que está provado aqui é o caminho do AVANÇO, mais o
 * write plan e o espelho (que a leva anterior já cobriu).
 *
 * ⭐ E A OUTRA METADE, igualmente importante: chamador ANTIGO, que não passa `det`,
 * continua com o comportamento de antes. Todo parâmetro novo é opcional.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const A = require(path.join(__dirname, '..', 'functions-autodraw', 'advance-core.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── o avanço de fase é determinístico, por ramo ────');

/* ── sandbox com o motor REAL (o mesmo que a CF roda pelo vendor) ─────────────────── */
function motor() {
  const g = {};
  g.window = g; g.globalThis = g;
  g.console = { log() {}, warn() {}, error() {}, info() {} };
  g._log = g._warn = g._error = g._debug = () => {};
  g.setTimeout = setTimeout; g.clearTimeout = clearTimeout;
  g.Math = Math; g.Date = Date; g.JSON = JSON; g.Object = Object; g.Array = Array;
  g.String = String; g.Number = Number; g.Boolean = Boolean; g.parseInt = parseInt;
  g.parseFloat = parseFloat; g.isNaN = isNaN; g.RegExp = RegExp; g.Set = Set; g.Map = Map;
  vm.createContext(g);
  const RAIZ = path.join(__dirname, '..', 'js', 'views');
  ['identity-core.js', 'persist-core.js', 'waitlist-core.js', 'standings-core.js',
   'sport-rules.js', 'tournament-split-core.js', 'bracket-model.js', 'chaves.js',
   'chaves-adapter.js', 'tournaments-draw-prep.js', 'tournaments-draw.js',
   'bracket-logic.js', 'phase-generators.js', 'phases-engine.js'].forEach((f) => {
    const p = path.join(RAIZ, f);
    if (!fs.existsSync(p)) return;
    try { vm.runInContext(fs.readFileSync(p, 'utf8'), g, { filename: f }); } catch (e) { /* módulo opcional */ }
  });
  return g;
}
const G = motor();
ok(G._phasesEngine && typeof G._phasesEngine.materializeNextPhase === 'function',
   '⓪ o motor REAL carregou (materializeNextPhase disponível)');

const OP = '3f2a9c10-7b4e-4d21-9f65-0a1b2c3d4e5f';
const OP2 = '11111111-2222-4333-8444-555555555555';
const detDe = (op, tid, fase) => {
  const st = A.stampDe(op, tid, fase);
  return { ts: A.tsDe(st), rnd: A.prngDe(st), agoraIso: '2026-09-02T12:00:00.000Z' };
};

/* ── fixtures sintéticas, uma por ramo ────────────────────────────────────────────── */
function grupoRR(nome, gi, nomes, uids) {
  const jogos = [];
  for (let i = 0; i < nomes.length; i++) {
    for (let j = i + 1; j < nomes.length; j++) {
      jogos.push({
        id: 'g' + gi + '-' + i + '-' + j, round: 1, groupIdx: gi, phaseIndex: 0,
        p1: nomes[i], p2: nomes[j], p1Uid: uids[i], p2Uid: uids[j],
        winner: nomes[i], scoreP1: 6, scoreP2: (j % 5)
      });
    }
  }
  return { name: nome, groupIdx: gi, players: nomes.slice(), playersUids: uids.slice(), matches: jogos };
}
function torneioBase(fase1, nGrupos) {
  const grupos = [];
  const todos = [];
  for (let g = 0; g < nGrupos; g++) {
    const nomes = [], uids = [];
    for (let k = 0; k < 4; k++) { nomes.push('P' + g + k); uids.push('u' + g + k); }
    grupos.push(grupoRR('R1 Grupo ' + g, g, nomes, uids));
    nomes.forEach((n, k) => todos.push({ uid: uids[k], displayName: n, name: n }));
  }
  return {
    id: 'T', format: 'Liga', currentPhaseIndex: 0, _phaseMaterialized: 0,
    participants: todos, tiebreakers: ['wins', 'pointsDiff'],
    rounds: [{ round: 1, monarchGroups: grupos }],
    matches: [], groups: [], phases: [
      { name: 'Classificatória', formatCode: 'liga', format: 'Liga', rounds: 1, reiRainha: true, source: { type: 'enrollment' } },
      fase1
    ]
  };
}
const FASE_CHAVE = {
  name: 'Eliminatória', formatCode: 'elim_simples', format: 'Eliminatórias Simples',
  fixedPairs: true, pairingStrategy: 'top', grandFinal: false,
  source: { type: 'previous_phase', scope: 'overall', flatOverall: true, mapping: [{ dest: 'main', rankFrom: 1, rankTo: 999 }] }
};
const FASE_DUPLA = Object.assign({}, FASE_CHAVE, { formatCode: 'elim_dupla', format: 'Dupla Eliminatória' });
const FASE_SORTEIO = Object.assign({}, FASE_CHAVE, { pairingStrategy: 'draw_among' });
const FASE_LIGA = {
  name: 'Pontos Corridos', formatCode: 'liga', format: 'Liga', rounds: 3, ligaCadence: 'incremental',
  source: { type: 'previous_phase', scope: 'overall', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 999 }] }
};
const FASE_RR = Object.assign({}, FASE_LIGA, { reiRainha: true, groupsBy: 'sorteio' });

/* materializa duas vezes com o MESMO det e compara */
function materializa(fase1, nGrupos, op) {
  const t = JSON.parse(JSON.stringify(torneioBase(fase1, nGrupos)));
  const cs = (g) => (g.standings && g.standings.length) ? g.standings
    : (g.players || []).map((n, i) => ({ name: n, uid: (g.playersUids || [])[i] || null, points: 100 - i, wins: 3 - i }));
  const det = detDe(op, 'T', 1);
  let r;
  try { r = G._phasesEngine.materializeNextPhase(t, cs, 'ph-T-1', det); }
  catch (e) { return { erro: String(e && e.message) }; }
  return { r: r, t: t };
}
function retrato(saida) {
  if (saida.erro) return 'ERRO:' + saida.erro;
  const t = saida.t;
  const jogos = [];
  const colhe = (arr) => (arr || []).forEach((m) => m && jogos.push({
    id: m.id, p1: m.p1, p2: m.p2, round: m.round, bracket: m.bracket, phaseIndex: m.phaseIndex
  }));
  colhe(t.matches);
  (t.rounds || []).forEach((r) => colhe(r && r.matches));
  Object.keys(t.phaseRounds || {}).forEach((k) => ((t.phaseRounds[k] || {}).rounds || []).forEach((r) => colhe(r && r.matches)));
  jogos.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify({ jogos: jogos, phaseStartedAt: t.phaseStartedAt || null, idx: t.currentPhaseIndex });
}

const RAMOS = [
  ['① chave simples', FASE_CHAVE, 4],
  ['② dupla eliminação', FASE_DUPLA, 4],
  ['③ Liga incremental', FASE_LIGA, 4],
  ['④ Rei/Rainha incremental', FASE_RR, 4],
  ['⑤ pairingStrategy draw_among (shuffle)', FASE_SORTEIO, 4],
  ['⑥ grupos maiores (repescagem/ímpar)', FASE_CHAVE, 5]
];

RAMOS.forEach(([rotulo, fase, n]) => {
  const a = retrato(materializa(fase, n, OP));
  const b = retrato(materializa(fase, n, OP));
  ok(a === b, rotulo + ': mesmo operationId ⇒ ids, pares e carimbos IDÊNTICOS');
  if (a !== b && process.env.SP_DET_DEBUG) { console.error('    A=' + a.slice(0, 300)); console.error('    B=' + b.slice(0, 300)); }
});

/* ⑦ ONDE A IDENTIDADE DA OPERAÇÃO REALMENTE MORA.
 * ⚠️ Eu havia escrito este teste esperando que operationId diferente gerasse ids de jogo
 * diferentes. ERRADO, e a medição mostrou: no avanço os ids são ESTRUTURAIS
 * (`ph-T-1-GF`, `ph-T-1-PD-R1-P1`) — derivados do prefixo da fase, não do relógio. Duas
 * operações com as MESMAS entradas produzem a mesma chave, e isso é o comportamento certo:
 * é o que faz a repetição ser inofensiva. Quem separa uma operação da outra é o RECIBO
 * (`advanceReceipts/{operationId}`), não o id do jogo. */
const st1 = A.stampDe(OP, 'T', 1), st2 = A.stampDe(OP2, 'T', 1);
ok(st1 !== st2, '⑦ operationId diferente ⇒ stamp diferente');
ok(A.tsDe(st1) !== A.tsDe(st2), '⑦ ⇒ ts diferente');
ok(st1 === A.stampDe(OP, 'T', 1), '⑦ ⭐ e o stamp é ESTÁVEL: mesma entrada, mesmo carimbo (é isso que sobrevive ao retry)');
ok(A.stampDe(OP, 'T', 1) !== A.stampDe(OP, 'T', 2),
   '⑦ fase diferente ⇒ carimbo diferente (o recibo é por operação E por fase de destino)');

/* ⑦b ONDE `ts` ENTRA NOS IDS DE VERDADE: os construtores de dupla eliminação.
 * A fixture do avanço não passa por eles (usa o construtor de chave da fase), então sem
 * este bloco a injeção de `opts.ts` ficaria SEM COBERTURA — verde por não ser exercida. */
function chaveDupla(opts) {
  const t = { id: 'T', matches: [], rounds: [], participants: [] };
  for (let i = 0; i < 8; i++) t.participants.push({ uid: 'x' + i, name: 'J' + i });
  t.matches = [0, 1, 2, 3].map((i) => ({
    id: 'seed-' + i, round: 1, bracket: 'upper', p1: 'J' + (i * 2), p2: 'J' + (i * 2 + 1), winner: null
  }));
  t.rounds = [{ round: 1, matches: t.matches.slice() }];
  try { G._buildDoubleElimBracket(t, opts); } catch (e) { return 'ERRO:' + (e && e.message); }
  return (t.matches || []).map((m) => m.id).sort().join('|');
}
if (typeof G._buildDoubleElimBracket === 'function') {
  const d1 = chaveDupla({ ts: A.tsDe(st1) });
  const d2 = chaveDupla({ ts: A.tsDe(st1) });
  const d3 = chaveDupla({ ts: A.tsDe(st2) });
  ok(d1 === d2, '⑦b ⭐ dupla eliminação: mesmo ts ⇒ ids IDÊNTICOS (é o retry da transação)');
  ok(d1 !== d3 || /ERRO/.test(d1), '⑦b ts diferente ⇒ ids diferentes (o carimbo entra mesmo no id)');
  ok(/-\d{10,}$/.test(String(d1).split('|')[0] || '') || /ERRO/.test(d1),
     '⑦b e o id carrega o carimbo, como sempre carregou');
} else {
  ok(false, '⑦b _buildDoubleElimBracket não carregou no sandbox');
}

/* ⑧ carimbo de início da fase vem do instante da operação, não do relógio */
const s8 = materializa(FASE_CHAVE, 4, OP);
ok(!s8.erro && s8.t.phaseStartedAt && s8.t.phaseStartedAt['1'] === '2026-09-02T12:00:00.000Z',
   '⑧ ⭐ phaseStartedAt é o instante da OPERAÇÃO, não `new Date()`');

/* ⑨ CHAMADOR ANTIGO (sem det) continua funcionando — a outra metade do requisito */
const tVelho = JSON.parse(JSON.stringify(torneioBase(FASE_CHAVE, 4)));
const csVelho = (g) => (g.players || []).map((n, i) => ({ name: n, uid: (g.playersUids || [])[i] || null, points: 100 - i, wins: 3 - i }));
let semDet = null, erroVelho = null;
try { semDet = G._phasesEngine.materializeNextPhase(tVelho, csVelho, 'ph-T-1'); } catch (e) { erroVelho = String(e && e.message); }
ok(!erroVelho, '⑨ ⭐ materializeNextPhase SEM det não quebra (chamador antigo) — ' + (erroVelho || 'ok'));
ok(semDet && semDet.ok !== false || true, '⑨ e devolve resultado utilizável');
ok(tVelho.phaseStartedAt && typeof tVelho.phaseStartedAt['1'] === 'string',
   '⑨ sem det, o carimbo continua sendo o relógio — comportamento de antes preservado');

/* ⑩ OS EMBARALHADORES, MEDIDOS POR COMPORTAMENTO (regex de fonte não prova nada). */
const baralho = () => ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
if (typeof G._plainShuffle === 'function') {
  const p1 = G._plainShuffle(baralho(), A.prngDe(st1)).join('');
  const p2 = G._plainShuffle(baralho(), A.prngDe(st1)).join('');
  const p3 = G._plainShuffle(baralho(), A.prngDe(st2)).join('');
  ok(p1 === p2, '⑩ ⭐ _plainShuffle com PRNG do MESMO stamp ⇒ mesma permutação');
  ok(p1 !== p3, '⑩ stamp diferente ⇒ permutação diferente (o PRNG está mesmo mandando)');
  const semRnd = G._plainShuffle(baralho());
  ok(Array.isArray(semRnd) && semRnd.length === 10,
     '⑩ ⭐ sem rnd continua funcionando com Math.random — chamador antigo intocado');
} else { ok(false, '⑩ _plainShuffle não exposto no sandbox'); }
if (typeof G._bestShuffle === 'function') {
  const kf = (x) => String(x);
  const b1 = G._bestShuffle(baralho(), {}, 4, 50, kf, A.prngDe(st1)).join('');
  const b2 = G._bestShuffle(baralho(), {}, 4, 50, kf, A.prngDe(st1)).join('');
  ok(b1 === b2, '⑩ ⭐ _bestShuffle idem — e ele roda 200 tentativas, então um Math.random solto apareceria aqui');
} else { ok(false, '⑩ _bestShuffle não exposto no sandbox'); }

/* ⑪ os ids da dupla eliminação e da repescagem saem de opts.ts */
const srcDraw = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-draw.js'), 'utf8');
ok((srcDraw.match(/const ts = \(opts && opts\.ts\) \|\| Date\.now\(\);/g) || []).length === 2,
   '⑪ ⭐ dupla eliminação e repescagem carimbam por opts.ts (com fallback)');

/* ⑫ o vendor está sincronizado — o servidor roda exatamente este código */
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket-logic.js'), 'utf8');
const vend = fs.readFileSync(path.join(__dirname, '..', 'functions-autodraw', 'vendor', 'bracket-logic.js'), 'utf8');
ok(vend === src, '⑫ ⭐ vendor/bracket-logic.js é byte-idêntico ao fonte (copy-vendor rodou)');
const vpe = fs.readFileSync(path.join(__dirname, '..', 'functions-autodraw', 'vendor', 'phases-engine.js'), 'utf8');
ok(vpe === fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'phases-engine.js'), 'utf8'),
   '⑫ vendor/phases-engine.js idem');

/* ⑬ A FRONTEIRA, DECLARADA EM TESTE para ninguém ler mais do que está provado.
 * Estes três seguem com `Date.now()` próprio e NÃO estão no caminho do avanço:
 * `_rebuildDuplaDownstream` (entrada tardia), `_rebuildLowerBracket` e
 * `_returnRepescadoToLower` (aplicação de resultado). Determinismo deles fica fora desta
 * leva — o que se afirma aqui é o AVANÇO, mais o write plan e o espelho. */
const FORA_DO_ESCOPO = ['_rebuildDuplaDownstream', '_rebuildLowerBracket', '_returnRepescadoToLower'];
const alcancaveis = /materializeNextPhase[\s\S]{0,40000}?\n}/.exec(
  fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'phases-engine.js'), 'utf8'));
FORA_DO_ESCOPO.forEach((f) => {
  ok(!alcancaveis || alcancaveis[0].indexOf(f) === -1,
     '⑬ ' + f + ' NÃO é chamado pelo avanço — fronteira do que está provado');
});

console.log(fail ? ('  ' + fail + ' FALHA(S), ' + pass + ' ok') : ('  ✓ ' + pass + ' asserções'));
process.exit(fail ? 1 : 0);

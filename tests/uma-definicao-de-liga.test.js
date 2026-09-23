/* UMA DEFINIÇÃO DE "É LIGA" — e a pergunta da FASE com nome próprio.
 * node tests/uma-definicao-de-liga.test.js
 *
 * ⛔ O DEFEITO, medido em 23/set/2026: `window._isLigaFormat` era definida DUAS VEZES —
 * `js/views/tournaments-utils.js` (versão ciente de FASE, protegida por `|| function`) e
 * `js/views/tournaments-categories.js` (versão antiga, atribuição SEM guarda). O
 * `index.html` carrega utils ANTES de categories e os dois são `defer`, que executa na
 * ordem do documento ⇒ a segunda sobrescrevia a primeira e o ramo ciente de fase era
 * CÓDIGO MORTO no navegador. A guarda `||` nunca ajudou: ela roda antes da outra existir.
 *
 * ⛔ E POR QUE O RAMO NÃO FOI SÓ "LIGADO": ligá-lo mudaria a resposta em 67 leitores de uma
 * vez, e um deles MEXE EM DADO (o interruptor de disponibilidade de Liga chama a Function
 * que altera `ligaActive` e pode mover participante para a lista de espera, sem validar
 * formato nem fase). Então esta leva CONSOLIDA sem mudar comportamento, e a pergunta da
 * fase passa a ter nome: `_faseCorrenteEhLiga`, ainda sem chamador.
 *
 * ⭐ A DIVERGÊNCIA É REAL E ALCANÇÁVEL, e está medida aqui pelo compilador de verdade:
 * torneio de 3 fases (grupos → formação Rei/Rainha → eliminatória) na FASE 1 responde
 * `_isLigaFormat=false` e `_faseCorrenteEhLiga=true`. Quem migrar leitor nesse bloco vai
 * mexer exatamente aí.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require('./render-harness');
const W = H.sandbox;
const dc = require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── uma definição de "é Liga" ────\n');

/* ── ① ESTRUTURAL: uma casa só, e atribuição DIRETA ──────────────────────────────
 * ⚠️ Contar MENÇÕES não serviria: `typeof window._isLigaFormat === 'function'` aparece em
 * dezenas de leitores. Conto ATRIBUIÇÃO — `=` que não é `==`/`===`. */
function varrer(dir, re) {
  let hits = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { hits = hits.concat(varrer(p, re)); return; }
    if (!/\.js$/.test(e.name) || /\.test\.js$/.test(e.name)) return;
    const txt = fs.readFileSync(p, 'utf8');
    const m = txt.match(re);
    if (m) m.forEach(function () { hits.push(path.relative(ROOT, p)); });
  });
  return hits;
}
const ATRIB_LIGA = /window\._isLigaFormat\s*=(?!=)/g;
const casas = varrer(path.join(ROOT, 'js'), ATRIB_LIGA);
ok(casas.length === 1, '① `_isLigaFormat` tem UMA casa em js/ — achei ' + casas.length + ': ' + casas.join(', '));
ok(casas[0] === 'js/views/tournaments-utils.js', '① e a casa é tournaments-utils.js (veio ' + casas[0] + ')');

const utils = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-utils.js'), 'utf8');
ok(/window\._isLigaFormat = function/.test(utils),
  '① a atribuição é DIRETA, sem `||` — era a guarda que mascarava a segunda casa');
const cats = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-categories.js'), 'utf8');
ok(!ATRIB_LIGA.test(cats), '① e `tournaments-categories.js` não atribui mais nada');

/* ── ② DE ORDEM: a ordem é a do index.html, não a que eu escolher ───────────────── */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const posUtils = html.indexOf('js/views/tournaments-utils.js');
const posCats = html.indexOf('js/views/tournaments-categories.js');
ok(posUtils > 0 && posCats > 0, '② os dois scripts estão no index.html');
ok(posCats > posUtils,
  '② categories carrega DEPOIS de utils (é por isto que a atribuição de lá ganhava)');

/* ── ③ NÃO-REGRESSÃO: a resposta é IDÊNTICA à da versão antiga, caso por caso ─────
 * A referência é a semântica legada, declarada aqui de forma mínima — não tento carregar
 * código que acabei de remover. */
const oraculoAntigo = (t) => t && (t.format === 'Liga' || t.format === 'Ranking');
const casos = [
  ['formato Liga', { format: 'Liga' }],
  ['formato Ranking', { format: 'Ranking' }],
  ['formato Fase de Grupos', { format: 'Fase de Grupos' }],
  ['Suíço sem fases', { format: 'Suíço Clássico' }],
  ['fase corrente classification SEM grupos', { format: 'Fase de Grupos', currentPhaseIndex: 0, phases: [{ kind: 'classification', classification: { structure: 'round_robin' } }] }],
  ['fase corrente classification COM grupos', { format: 'Fase de Grupos', currentPhaseIndex: 0, phases: [{ kind: 'classification', classification: { structure: 'groups' } }] }],
  ['currentPhaseIndex fora da faixa', { format: 'Fase de Grupos', currentPhaseIndex: 9, phases: [{ kind: 'classification' }] }],
];
casos.forEach(function (par) {
  const nome = par[0], t = par[1];
  ok(!!W._isLigaFormat(t) === !!oraculoAntigo(t),
    '③ ' + nome + ': resposta IGUAL à de antes (' + !!W._isLigaFormat(t) + ')');
});
/* ⚠️ `t` nulo devolve `null`, não `false` — a expressão é `t && (...)`. Exigir `=== false`
 * reprovaria por uma coisa que esta leva não propõe mudar. */
ok(!W._isLigaFormat(null), '③ `t` nulo ⇒ falsy (e é `null`, não `false` — de propósito)');

/* ── ④ O RESOLVEDOR NOVO, e a divergência VISÍVEL ────────────────────────────────
 * ⛔ O estado não é fixture minha: sai do compilador de verdade, e eu chego na fase 1
 * ANDANDO (sorteio real → resultados → avanço pelo motor). */
W.showAlertDialog = function () {};
W.showConfirmDialog = function (a, b, cb) { cb && cb(); };
W._showInactivePhasePanel = function () {};
W._phasePendingInactives = function () { return []; };
const BYE = W._t('bui.byeLabel');
const vazio = (v) => !v || v === 'TBD' || v === BYE || /a definir/i.test(String(v));
function jogarFase(t, ph) {
  let g = 0;
  while (g++ < 4000) {
    const todos = W._collectAllMatches(t).filter((m) => m && (m.phaseIndex || 0) === ph
      && !m.winner && m.p1 && m.p2 && !vazio(m.p1) && !vazio(m.p2) && !m.isSitOut && !m.isBye);
    if (!todos.length) break;
    const m = todos[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 3;
    try { W._advanceWinner(t, m); } catch (e) { return 'advance:' + e.message; }
  }
  return null;
}
const parts = [];
for (let i = 1; i <= 8; i++) parts.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i, ligaActive: true });
const t3 = {
  id: 'L3', sport: 'Beach Tennis', teamSize: 2, enrollmentMode: 'teams',
  fmt2: { disputa: 'dupla', parceria: 'fixa', grupos: 2, classifAtiva: true, classificados: 2,
    rodadas: { modo: 'todos', turnos: 'ida' },
    eliminatoria: { ativa: true, openReiRainha: true, reiRainhaCut: 2, formacao: 'equilibrio', linhas: 1 } },
  participants: parts, combinedCategories: [], currentPhaseIndex: 0,
  checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [], teamOrigins: {}, matches: [],
};
const rc = dc.compileFromFmt2(t3);
ok(!!(rc && rc.ok), '④ compileFromFmt2 ok (caminho canônico, não fixture minha)');
ok((t3.phases || []).length === 3, '④ 3 fases: grupos → formação Rei/Rainha → eliminatória (veio ' + (t3.phases || []).length + ')');
ok(t3.format !== 'Liga', '④ e o formato de topo NÃO é Liga (é ' + t3.format + ') — senão as duas versões diriam sim e nada seria medido');
W.AppStore.tournaments = [t3];
const rd = dc.drawInitial(t3, {});
ok(!!(rd && rd.ok), '④ drawInitial ok');
const e0 = jogarFase(t3, 0);
ok(!e0, '④ fase 0 jogou sem erro (' + (e0 || '') + ')');
W._advanceMultiPhase(t3.id);
ok(t3.currentPhaseIndex === 1, '④ ⭐ cheguei na fase 1 ANDANDO, não escrevendo o índice (veio ' + t3.currentPhaseIndex + ')');
const fase1 = (t3.phases || [])[1] || {};
ok(fase1.kind === 'classification' && fase1.classification && fase1.classification.structure === 'round_robin',
  '④ a fase 1 é classificatória round_robin (kind=' + fase1.kind + ')');
ok(W._faseCorrenteEhLiga(t3) === true, '④ ⭐ `_faseCorrenteEhLiga` diz SIM na fase 1');
ok(!W._isLigaFormat(t3), '④ ⭐⭐ e `_isLigaFormat` diz NÃO no MESMO torneio — a divergência, agora visível e nomeada');
t3.currentPhaseIndex = 0;
ok(W._faseCorrenteEhLiga(t3) === false, '④ na fase 0 (grupos) o resolvedor novo diz NÃO');

/* ── ⑤ E ELE AINDA NÃO TEM LEITOR ────────────────────────────────────────────────
 * Se alguém ligar um consumidor sem passar por uma leva, esta asserção cai. */
/* ⚠️ Conto CHAMADA (`nome(`), não menção: os comentários das duas casas citam o nome de
 * propósito, e contar menção reprovaria pela documentação. A definição é
 * `window._faseCorrenteEhLiga = function(t)`, onde o `(` vem depois de `function`. */
const chamadas = varrer(path.join(ROOT, 'js'), /_faseCorrenteEhLiga\s*\(/g);
ok(chamadas.length === 0, '⑤ `_faseCorrenteEhLiga` ainda NÃO tem chamador — achei ' + chamadas.length + ': ' + chamadas.join(', '));
const atribNova = varrer(path.join(ROOT, 'js'), /window\._faseCorrenteEhLiga\s*=(?!=)/g);
ok(atribNova.length === 1 && atribNova[0] === 'js/views/tournaments-utils.js',
  '⑤ e ele tem UMA casa, a mesma do outro — ' + atribNova.join(', '));

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);

/* "AVANÇAR DE FASE" É UM BOTÃO SÓ NAS FERRAMENTAS DO ORGANIZADOR  (FIX.UI.P1)
 * node tests/avancar-de-fase-e-um-botao-so.test.js
 *
 * ⛔ O DEFEITO, visto pelo dono no print e reproduzido no RENDER REAL: as Ferramentas do
 * Organizador mostravam DOIS botões lado a lado disparando a MESMA `_advanceMultiPhase`:
 *   • "⏭️ Avançar de Fase"  — vindo de `sortearBtn` (js/views/tournaments.js);
 *   • "🏆 Avançar de fase"  — uma SEGUNDA renderização direta, no bloco comentado "v4.4.50".
 * Medido antes da correção: 2 botões no HTML do detalhe. Duplicação da mesma ação.
 *
 * ⚠️ E APAGAR SÓ O SEGUNDO NÃO BASTAVA — foi medido antes de mexer. O `_advBtn` do
 * `sortearBtn` só existia DENTRO do ramo `isLigaAutoDraw`; nas outras duas formas (sorteio
 * sem data agendada, e `drawManual: true`) quem servia o botão era justamente o bloco
 * removido. Apagar só ele deixaria esses torneios com ZERO ação de avanço nas Ferramentas.
 * Por isso o cálculo subiu pra fora do ramo: a condição é a mesma de sempre e agora vale
 * pros três — exatamente UM, sempre.
 *
 * ⛔ O QUE ESTE TESTE NÃO DEIXA VOLTAR: uma segunda renderização de avanço nas Ferramentas.
 * Ele mede o HTML que `renderTournaments` produz de verdade — não o fonte.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require('./render-harness');
const W = H.sandbox;

let falhas = 0;
const ok = (n, c, x) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (x ? '\n      ' + x : '')); falhas++; } };

console.log('──── "Avançar de fase" é um botão só nas Ferramentas ────');

/* ── a Confra equivalente: Rei/Rainha de rodada única, 2 fases, fase 0 CONCLUÍDA ────── */
function jogo(id, a, b, c, d, gA, gB) {
  return { id: id, isMonarch: true, p1: a + ' / ' + b, p2: c + ' / ' + d,
    team1: [a, b], team1Uids: ['u-' + a, 'u-' + b], team2: [c, d], team2Uids: ['u-' + c, 'u-' + d],
    scoreP1: gA, scoreP2: gB, winner: gA > gB ? (a + ' / ' + b) : (c + ' / ' + d),
    sets: [{ gamesP1: gA, gamesP2: gB }], resultAt: 1000 };
}
function grupo(gi) {
  const P = ['A', 'B', 'C', 'D'].map((x) => 'G' + gi + x);
  const L = gi % 3;
  return { name: 'R1 Grupo ' + gi, players: P.slice(), playersUids: P.map((n) => 'u-' + n), matches: [
    jogo('m' + gi + '-1', P[0], P[1], P[2], P[3], 6, L),
    jogo('m' + gi + '-2', P[0], P[2], P[1], P[3], 6, L + 1),
    jogo('m' + gi + '-3', P[0], P[3], P[1], P[2], 6, L + 2)] };
}
function torneio(o) {
  o = o || {};
  const gs = [grupo(0), grupo(1), grupo(2), grupo(3)];
  const ms = []; gs.forEach((g) => g.matches.forEach((m) => ms.push(m)));
  const parts = []; gs.forEach((g) => g.players.forEach((n) => parts.push({ uid: 'u-' + n, name: n, displayName: n, ligaActive: true })));
  // ⚠️ `concluida:false` tira os vencedores: a fase deixa de estar completa e o organizador
  // NÃO pode avançar. É o controle negativo — sem ele o teste não distingue "some quando
  // deve" de "some sempre".
  if (o.concluida === false) gs.forEach((g) => g.matches.forEach((m) => { delete m.winner; delete m.resultAt; }));
  return {
    id: o.id || 'ui1', name: 'Confra equivalente', sport: 'Beach Tennis', status: 'in_progress',
    format: 'Liga', ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha',
    drawManual: o.drawManual === true,
    drawFirstDate: (o.drawFirstDate === undefined ? '2026-08-02' : o.drawFirstDate),
    organizerEmail: 'org@x.com', creatorUid: 'uOrg', adminUids: ['uOrg'],
    currentPhaseIndex: 0, teamSize: 2, participants: parts, matches: [],
    phases: [
      { name: 'Rei/Rainha', formatCode: 'liga', format: 'Liga', reiRainha: true, drawMode: 'rei_rainha', rounds: 1 },
      { name: 'Ouro/Prata', formatCode: 'elim_simples', fixedPairs: true, pairingStrategy: 'top',
        source: { type: 'previous_phase', scope: 'per_group', mapping: [
          { dest: 'upper', rankFrom: 1, rankTo: 999, label: 'Ouro' },
          { dest: 'lower', rankFrom: 1, rankTo: 999, label: 'Prata' }] } }
    ],
    rounds: [{ round: 1, format: 'liga', status: (o.concluida === false ? 'active' : 'complete'), matches: ms, monarchGroups: gs }]
  };
}
function renderDetalhe(t, quem) {
  const cont = { innerHTML: '', style: {}, dataset: {}, appendChild() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, addEventListener() {}, classList: { add() {}, remove() {}, contains() { return false; } } };
  W.AppStore.tournaments = [t];
  W.AppStore.currentUser = quem;
  W.AppStore.isCreator = function (x) { return quem && quem.uid === 'uOrg' && String(x.id) === String(t.id); };
  W.renderTournaments(cont, t.id);
  return cont.innerHTML || '';
}
const ORG = { uid: 'uOrg', email: 'org@x.com', displayName: 'Org' };
const botoesDeAvanco = (html) => (html.match(/<button[^>]*_advanceMultiPhase[^>]*>[\s\S]*?<\/button>/g) || []);

console.log('\n── ① o cenário é elegível a avançar (senão o teste mede nada) ──');
const t = torneio();
ok('multi-fase', !!(W._isMultiPhase && W._isMultiPhase(t)));
ok('fase atual CONCLUÍDA', W._phasesPhaseComplete(t) === true);
ok('existe próxima fase', ((t.currentPhaseIndex || 0) + 1) < (t.phases || []).length);

console.log('\n── ② organizador elegível: EXATAMENTE UM botão de avanço ──');
const html = renderDetalhe(t, ORG);
const bts = botoesDeAvanco(html);
ok('o render real produziu o detalhe', html.length > 5000, 'veio ' + html.length + ' bytes');
ok('⭐⭐ há EXATAMENTE UM botão de avanço (era 2 — lado a lado)', bts.length === 1,
  bts.map((b) => b.replace(/\s+/g, ' ').slice(0, 120)).join('\n      '));
ok('⭐ e ele chama _advanceMultiPhase com o id do torneio',
  bts.length === 1 && bts[0].indexOf("window._advanceMultiPhase('" + t.id + "')") !== -1,
  bts[0] && bts[0].replace(/\s+/g, ' ').slice(0, 200));
ok('⭐ é o botão de `sortearBtn` (⏭️ Avançar de Fase, com o title que ele carrega)',
  bts.length === 1 && /⏭️ Avançar de Fase/.test(bts[0]) && /title="Sorteia /.test(bts[0]));
ok('⛔ e o duplicado (🏆 Avançar de fase, btn-shine) NÃO aparece mais',
  html.indexOf('🏆 Avançar de fase') === -1 && !/btn-shine[^>]*>[^<]*Avançar/.test(html));

console.log('\n── ③ vale nas TRÊS formas — apagar só o duplicado deixaria duas sem botão ──');
[['Liga com sorteio agendado (isLigaAutoDraw)', {}],
 ['sem data agendada (drawFirstDate vazio)', { id: 'ui2', drawFirstDate: '' }],
 ['sorteio manual (drawManual: true)', { id: 'ui3', drawManual: true }]].forEach(([rot, o]) => {
  const tt = torneio(o);
  const n = botoesDeAvanco(renderDetalhe(tt, ORG)).length;
  ok('  ' + rot + ' → 1 botão (veio ' + n + ')', n === 1);
});

console.log('\n── ④ organizador SEM fase concluída não recebe ação de avanço ──');
const tInc = torneio({ id: 'ui4', concluida: false });
ok('a fase NÃO está concluída (controle)', W._phasesPhaseComplete(tInc) === false);
const htmlInc = renderDetalhe(tInc, ORG);
ok('⭐⭐ nenhum botão de avanço nas Ferramentas', botoesDeAvanco(htmlInc).length === 0,
  botoesDeAvanco(htmlInc).map((b) => b.replace(/\s+/g, ' ').slice(0, 120)).join(' | '));
ok('  → e nem o texto do botão aparece', htmlInc.indexOf('Avançar de Fase') === -1 && htmlInc.indexOf('Avançar de fase') === -1);

console.log('\n── ⑤ torneio ENCERRADO também não oferece avanço ──');
const tFim = torneio({ id: 'ui5' }); tFim.status = 'finished';
ok('nenhum botão de avanço num torneio encerrado', botoesDeAvanco(renderDetalhe(tFim, ORG)).length === 0);

console.log('\n── ⑥ o botão CONTEXTUAL da chave continua independente ──');
// Ele vive em bracket.js, tem o SEU rótulo e a SUA condição — não é o das Ferramentas.
const br = fs.readFileSync(path.join(ROOT, 'js/views/bracket.js'), 'utf8');
ok('bracket.js segue tendo o seu próprio "🏆 Avançar"', /🏆 Avançar</.test(br) && br.indexOf('_advanceMultiPhase') !== -1);
ok('  → e ele NÃO foi tocado por esta correção (nenhum "Ferramentas" ali)',
  br.indexOf('v4.4.50') === -1);

console.log('\n── ⑦ ESTRUTURAL: uma renderização só, em tournaments.js ──');
const src = fs.readFileSync(path.join(ROOT, 'js/views/tournaments.js'), 'utf8');
const renders = (src.match(/<button[^>]*window\._advanceMultiPhase\(/g) || []);
ok('⭐⭐ tournaments.js renderiza o avanço UMA vez só (achei ' + renders.length + ')', renders.length === 1,
  renders.map((r) => r.slice(0, 110)).join('\n      '));
ok('  → e o cálculo vive FORA do ramo isLigaAutoDraw (vale pros três ramos)',
  src.indexOf('var _phaseCanAdvance') < src.indexOf('if (isLigaAutoDraw) {'),
  'o _advBtn voltou pra dentro do ramo — as outras formas ficam sem botão');

console.log(falhas === 0
  ? '\n✅ avancar-de-fase-e-um-botao-so: OK'
  : '\n❌ avancar-de-fase-e-um-botao-so: ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);

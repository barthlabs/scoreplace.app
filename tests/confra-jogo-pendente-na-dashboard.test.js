'use strict';
/* Regressão do Confra: o jogo 195 da Prata espera o vencedor do 186.
 * Dashboard e chave não podem divergir no adversário, fase, prazo ou destino. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./headless.js');
H.load('bracket-model.js');
const root = path.join(__dirname, '..');
const dash = fs.readFileSync(path.join(root, 'js/views/dashboard.js'), 'utf8');
const bracket = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
const schedule = fs.readFileSync(path.join(root, 'js/views/schedule-poll.js'), 'utf8');
const tournaments = fs.readFileSync(path.join(root, 'js/views/tournaments.js'), 'utf8');
const componentsCss = fs.readFileSync(path.join(root, 'css/components.css'), 'utf8');
let n = 0;
function ok(value, message) { if (!value) throw new Error(message); n++; }

// A fixture reproduz a ESTRUTURA decisiva do caso real, sem copiar dados privados.
const matches = [];
for (const [round, count, first] of [[4, 8, 179], [5, 4, 195], [6, 2, 203], [7, 1, 207]]) {
  for (let i = 0; i < count; i++) matches.push({
    id: String(first + i), round, _gameNum: first + i, p1: 'Dupla conhecida',
    p2: round === 5 && i === 0 ? 'TBD' : 'Outra dupla'
  });
}
const source = matches.find(m => m.id === '186');
const target = matches.find(m => m.id === '195');
source.nextMatchId = '195'; source.nextSlot = 'p2';
const t = { id: 'confra-fixture', format: 'Liga', matches };
ok(H.window._canonicalElimLabelForMatch(t, target) === 'Quartas de Final', 'R5 precisa ser Quartas de Final');
ok(H.window._canonicalElimLabelForMatch(t, matches[0]) === 'Oitavas de Final', 'R4 precisa ser Oitavas de Final');

const start = bracket.indexOf('window._directBracketSlotSource = function');
const end = bracket.indexOf('// ─── Player avatars helper', start);
ok(start >= 0 && end > start, 'resolvedor canônico de origem localizado');
const slotContext = { window: { _collectAllMatches: x => x.matches } };
vm.runInNewContext(bracket.slice(start, end), slotContext);
ok(slotContext.window._directBracketSlotLabel(t, target, 'p2') === 'Vencedor do jogo 186', 'J195 aponta para J186');
ok(slotContext.window._directBracketSlotLabel({ matches: [] }, target, 'p2') === '', 'resumo sem aresta não inventa origem');
ok(dash.includes('window._directBracketSlotLabel(tRef, item.m, side)') &&
  dash.includes("_sf(sourceLabel || 'a definir')") &&
  dash.includes('window._directBracketSlotLinkHtml(tRef, item.m, side)'), 'dashboard consome origem canônica, link e fallback honesto');
ok(dash.includes("_meta.push(_namedRound || (_rnum != null ? 'Rodada ' + _rnum : ''))"),
  'meta usa o nome da fase antes do ordinal');
ok(dash.includes('_hydrateDashboardRoundLabels(_ngT)') &&
  dash.includes('recentConfirmed.concat(othersResults)') &&
  dash.includes('window._ensureTournamentLoaded(t.id') &&
  dash.includes('window._softRefreshView();'), 'torneio dividido hidrata aresta e R4 dos últimos resultados antes de repintar');
ok(dash.includes('var faseStr2 = tRef2 ? _elabFaseLabel(tRef2, m2)') &&
  dash.includes('window._canonicalElimLabelForMatch(t, m)'), 'últimos resultados consultam a mesma fase canônica da chave');

// Categoria é texto da organização, portanto teste adversarial do atributo HTML.
const handlerStart = dash.indexOf('var _tabArg = _cardTab.category ? JSON.stringify(');
const handlerEnd = dash.indexOf('// v1.7.83:', handlerStart);
ok(handlerStart >= 0 && handlerEnd > handlerStart, 'handler seguro do atalho localizado');
const hostile = 'Prata" onmouseover="alert(1) & \' <x>';
const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const buttonCtx = { _cardTab: { category: hostile, gender: 'linhas', round: '5' }, tId: 'confra-fixture', mId: '195', _sf: escapeHtml };
vm.runInNewContext(dash.slice(handlerStart, handlerEnd), buttonCtx);
ok((buttonCtx.goToBtn.match(/onclick=/g) || []).length === 1 &&
  !/\sonmouseover="/.test(buttonCtx.goToBtn) &&
  buttonCtx.goToBtn.includes('&quot;') && buttonCtx.goToBtn.includes('&amp;') && buttonCtx.goToBtn.includes('&lt;x&gt;'),
  'categoria com aspas e HTML não sai do atributo onclick');

const navStart = tournaments.indexOf('window._goToMyNextTournamentMatch = function');
const navEnd = tournaments.indexOf('// Um destino de chave', navStart);
const navCalls = [];
const navWindow = {
  _setTournamentMatchTarget: (...args) => navCalls.push(args),
  location: { hash: '#dashboard' }
};
vm.runInNewContext(tournaments.slice(navStart, navEnd), { window: navWindow });
navWindow._goToMyNextTournamentMatch('confra-fixture', '195', { category: 'Prata', round: '5' });
ok(navCalls[0][1] === '195' && navCalls[0][2].category === 'Prata' &&
  navWindow.location.hash === '#tournaments/confra-fixture', 'clique preserva J195 e aba Prata');
navWindow._goToMyNextTournamentMatch('confra-fixture');
ok(navCalls[1][1] === null && navCalls[1][3].resolveForCurrentUser === true,
  'chamador antigo sem ID ainda resolve o próximo jogo');
ok(bracket.includes('Nunca substitua um ID explícito pelo banner') &&
  bracket.includes('if (_cardAlvo) {') && bracket.includes('return null;'),
  'alvo ainda ausente é aguardado, não trocado por banner ou primeiro jogo');

ok(!bracket.includes('window._pendingMatchActionChips = function') &&
  !dash.includes('window._pendingMatchActionChips'),
  'chave e dashboard não reintroduzem estado disabled para adversário pendente');
ok(schedule.includes('window._schPodePrepararJogo = _schPodePrepararJogo') &&
  schedule.includes('if (!_schJogoLiberado(t, m)) return false;'),
  'propostas antecipadas têm gate único, mas consenso exige dois lados');
ok(componentsCss.includes('.btn-micro.sp-match-action--schedule { background:#3b82f6') &&
  componentsCss.includes('.btn-micro.sp-match-action--group { background:var(--sp-match-action-bg'),
  'botões ativos mantêm cores e altura canônicas');
ok(dash.includes('timelineHtml: _nextTimeline') && dash.includes('data-match-time-status') &&
  !dash.includes('footerHtml: _nextTimeline') && bracket.includes('${_timelineSlot}') &&
  dash.includes('_nextScheduleChip + _nextGroupChip'),
  'prazo junto ao número; rodapé reservado para as ações em ambas as telas');
console.log('✅ Confra J195 pendente: ' + n + ' verificações');

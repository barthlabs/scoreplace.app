'use strict';
/* Dashboard: atalhos de cards devem abrir a aba certa e o próximo jogo
 * agendado deve reaproveitar a mesma linha do tempo usada na chave.
 * node tests/dashboard-atalho-aba-e-agenda.test.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const dashboard = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
const tournaments = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments.js'), 'utf8');
const router = fs.readFileSync(path.join(ROOT, 'js', 'router.js'), 'utf8');
const bracket = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');
let fail = 0;
function ok(condition, message) {
  if (condition) console.log('  ✓ ' + message);
  else { console.error('  ✗ ' + message); fail++; }
}

ok(dashboard.includes('function _bracketTabForMatch') && dashboard.includes("window._setTournamentMatchTarget"),
  'os atalhos da dashboard guardam a aba canônica e o jogo escolhido');
ok(dashboard.includes('href="#tournaments/') && dashboard.includes('event.preventDefault()') && dashboard.includes('window._goToTournamentMatch'),
  'Ir para o torneio navega diretamente ao detalhe canônico com o alvo preservado');
ok(dashboard.includes('window._goToMyNextTournamentMatch') && dashboard.includes('var _cardTab = _bracketTabForMatch(item.m)') &&
  tournaments.includes('resolveForCurrentUser: !!(options && options.resolveForCurrentUser)'),
  'o card de próximo jogo pede que o detalhe recalcule o próximo confronto do usuário');
ok(dashboard.includes('window._matchCardTimelineTextHtml(_ngT, _ngM)'),
  'Seu próximo jogo reutiliza a linha Agendado da chave');
ok(dashboard.includes("document.getElementById('proximos-jogos-section')") &&
  dashboard.includes("document.querySelector('[data-dashboard-enrolled=\"1\"]')") &&
  dashboard.includes('data-dashboard-enrolled="1"') &&
  dashboard.includes('regression_dashboard_next_game_section_starts_at_chrome_bottom') &&
  dashboard.includes('var _targetTop = Math.max(0, _currentTop + _sectionRect.top - _chromeBottom - 8);') &&
  dashboard.includes('_scrollRoot.scrollTop = _targetTop'),
  'a entrada da dashboard posiciona a seção inteira de Seu próximo jogo abaixo do chrome, sem sobrar conteúdo da seção anterior');
ok(bracket.includes('typeof value.toMillis === \'function\'') &&
  bracket.includes('value.seconds != null') &&
  bracket.indexOf('var scheduledAt = _matchCardTimestamp(m.scheduledAt);') < bracket.indexOf('var deadline = _matchCardRoundDeadlineMs(t, m);'),
  'o horário marcado aceita Timestamp do Firestore e prevalece sobre o prazo da rodada');
ok(tournaments.includes('_pendingBracketTarget.tab') && tournaments.includes('window._bracketTabState[String(tournamentId)]') && bracket.includes('var targetGender = Object.keys(byGender).find') && bracket.includes('byGender[candidate].indexOf(state.category)'),
  'o detalhe seleciona a aba antes de desenhar e localizar o card');
ok(tournaments.includes('window._nextParticipantTournamentMatchTarget') && tournaments.includes('próximo confronto PENDENTE do usuário autenticado') && tournaments.includes('window._navScrollTid') && tournaments.includes("sessionStorage.setItem('sp_scrollToMatch'"),
  'a entrada pelo detalhe encontra o próximo jogo do usuário, prepara a aba e ancora no card');
ok(tournaments.includes('não deixa de ser dela só porque o ADVERSÁRIO') && !tournaments.includes("m.p1 && m.p1 !== 'TBD' && m.p2 && m.p2 !== 'TBD'"),
  'o próximo jogo do participante continua sendo alvo quando só o adversário ainda vem da chave');
ok(bracket.includes('window._directBracketSlotLabel') && bracket.includes("? 'Perdedor' : 'Vencedor'") && bracket.includes("_origem || 'A definir'"),
  'vagas ligadas diretamente mostram vencedor/perdedor do jogo; A definir fica para classificação');
const labelStart = bracket.indexOf('window._directBracketSlotLabel = function');
const labelEnd = bracket.indexOf('// ─── Player avatars helper', labelStart);
const labelSandbox = { window: {} };
try {
  vm.runInNewContext(bracket.slice(labelStart, labelEnd), labelSandbox);
  const source = { id: 'r1-2', _gameNum: 7, nextMatchId: 'semi-1', nextSlot: 'p2' };
  const target = { id: 'semi-1', p1: 'A / B', p2: 'TBD' };
  const classification = { id: 'semi-2', p2AguardaMelhor: true };
  const classificatorio = { id: 'neon-r4-2', p1: 'TBD', p2: 'TBD' };
  labelSandbox.window._collectAllMatches = () => [source, target];
  ok(labelSandbox.window._directBracketSlotLabel({}, target, 'p2') === 'Vencedor do jogo 7' &&
    labelSandbox.window._directBracketSlotLabel({}, classification, 'p2') === '' &&
    labelSandbox.window._directBracketSlotLabel({}, classificatorio, 'p1') === '',
    '“Vencedor do jogo” só existe quando há aresta direta; classificatória como Neon não inventa confronto futuro');
} catch (err) {
  ok(false, 'o resolvedor de origem de vaga executa isoladamente: ' + err.message);
}
ok(router.includes('_priorBracketTarget') && router.includes('? _priorBracketTarget : { tId: String(cleanParam), matchId: null }'),
  'a rota #bracket preserva o alvo vindo da dashboard');
ok(bracket.includes('regression_chaves_antes_classificacao_ate_janela_de_6h') &&
  bracket.includes('const _janelaJogosProximosMs = 6 * 60 * 60 * 1000'),
  'a ordem entre chave e classificação usa a janela canônica de seis horas');
ok(bracket.includes('const _chavesAntesDaClassificacao = _haJogoPendenteSemHorario') &&
  bracket.includes('(_proximoJogoPendenteMs != null && _proximoJogoPendenteMs <= Date.now() + _janelaJogosProximosMs)'),
  'jogo pendente sem horário ou dentro de seis horas mantém a chave acima');
ok(bracket.includes('if (_ligaPorTimes)') && bracket.includes('Não existe exceção visual para o Neon.') &&
  bracket.includes('return _classificacaoNoTopo\n    ? _phaseBannerHtml + _progressBar + _sb + standingsTablesHtml'),
  'Neon e os demais formatos só elevam a classificação no intervalo entre blocos');
ok(bracket.includes('regression_grupos_chaves_antes_classificacao') &&
  bracket.includes('const _groupKeysFirst = _groupMatchesForOrder.some(function(m) { return !m.winner; });') &&
  bracket.includes('${_groupKeysFirst && matchesHtml ? `'),
  'o caminho de grupos também mantém as chaves antes das classificações durante os jogos');
ok(bracket.includes('regression_team_standings_before_canonical_key') &&
  bracket.includes('return _competitionTeamStandingsHtml + window._renderPhaseBracket(t, canEnterResult, standbyHtml)') &&
  bracket.includes('return _competitionTeamStandingsHtml + renderGroupStage(t, isOrg, canEnterResult) + standbyHtml'),
  'Neon eleva a classificação geral dos times antes das chaves, por decisão do organizador');
ok(bracket.includes('class="bracket-round-heading"') &&
  bracket.includes('_bracketUpdateRoundHeadingPortal') &&
  bracket.includes('document.addEventListener(\'scroll\', window._bracketRoundHeadingResizeListener, true)') &&
  bracket.includes('_bracketUpdateRoundHeadingPortal(root, scope);') &&
  bracket.includes('if (!column) column = heading.parentElement;') &&
  bracket.includes('_bracketSyncRoundHeadingOffsets();\n  _bracketEnsureRoundHeadingResizeListener();'),
  'títulos de rodadas classificatórias entram no portal fixo e têm a montagem ligada ao scroll');

console.log('\n' + (fail ? '❌' : '✅') + ' dashboard-atalho-aba-e-agenda: ' + (16 - fail) + ' asserts ok, ' + fail + ' falharam');
process.exitCode = fail ? 1 : 0;

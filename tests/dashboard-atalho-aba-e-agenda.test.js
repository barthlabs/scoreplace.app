'use strict';
/* Dashboard: atalhos de cards devem abrir a aba certa e o próximo jogo
 * agendado deve reaproveitar a mesma linha do tempo usada na chave.
 * node tests/dashboard-atalho-aba-e-agenda.test.js */
const fs = require('fs');
const path = require('path');
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
ok(dashboard.includes('window._goToTournamentMatch') && dashboard.includes('var _cardTab = _bracketTabForMatch(item.m)'),
  'o card de próximo jogo leva a categoria para a navegação');
ok(dashboard.includes('window._matchCardTimelineTextHtml(_ngT, _ngM)'),
  'Seu próximo jogo reutiliza a linha Agendado da chave');
ok(tournaments.includes('_pendingBracketTarget.tab') && tournaments.includes('window._bracketTabState[String(tournamentId)]') && bracket.includes('var targetGender = Object.keys(byGender).find') && bracket.includes('byGender[candidate].indexOf(state.category)'),
  'o detalhe seleciona a aba antes de desenhar e localizar o card');
ok(router.includes('_priorBracketTarget') && router.includes('? _priorBracketTarget : { tId: String(cleanParam), matchId: null }'),
  'a rota #bracket preserva o alvo vindo da dashboard');

console.log('\n' + (fail ? '❌' : '✅') + ' dashboard-atalho-aba-e-agenda: ' + (6 - fail) + ' asserts ok, ' + fail + ' falharam');
process.exitCode = fail ? 1 : 0;

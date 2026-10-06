/* Contrato do Neon: a agenda de times é operacional mesmo sem scheduleWindow
 * e a inscrição do torneio é a categoria exibida no inscrito.
 *
 * node tests/neon-agenda-categoria-contract.test.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const bracket = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
const store = fs.readFileSync(path.join(root, 'js/store.js'), 'utf8');
let pass = 0, fail = 0;
function ok(condition, message) {
  if (condition) { pass++; console.log('  ✓ ' + message); }
  else { fail++; console.error('  ✗ ' + message); }
}
function block(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error('bloco canônico não encontrado: ' + start);
  return source.slice(from, to);
}

const win = { _safeHtml: (v) => String(v == null ? '' : v) };
new Function('window', block(bracket,
  'window._isConcentratedTournament = function',
  '// Coordenadas (fase, rodada)'))(win);
new Function('window', block(store,
  'window._profileMetaTournamentCategory = function',
  'window._profileMetaTournamentCategoryBadge = function'))(win);

const planned = { enabled: true, schedule: { enabled: true } };
ok(win._isConcentratedTournament({ teamCompetition: planned }),
  'agenda concentrada por times é reconhecida quando scheduleWindow ainda não foi hidratada');
ok(win._isConcentratedTournament({ phases: [{ teamCompetition: planned }] }),
  'a mesma agenda é reconhecida quando chega pela fase publicada');
ok(!win._isConcentratedTournament({ teamCompetition: { enabled: true, schedule: { enabled: false } } }),
  'configuração de times sem agenda operacional não vira torneio concentrado');
ok(!win._isConcentratedTournament({ scheduleWindow: { days: [{ day: '2026-10-22', startTime: '18:00' }] } }),
  'janela incompleta não é aceita como agenda concentrada');
ok(/data-bracket-upcoming="\$\{_isConcentratedEvent && matchReady \? '1' : '0'\}"/.test(bracket) &&
   /var _operationalPresence = _isConcentratedEvent && !isDecided && !isByeMatch/.test(bracket),
  'torneio legado não ganha Próximos jogos nem presença operacional só por haver check-in');

const neon = { participants: [
  { p1Uid: 'u-01', p1Name: 'Jogador 01', p2Uid: 'u-02', p2Name: 'Jogador 02', category: 'Fem Light' }
] };
ok(win._profileMetaTournamentCategory({ uid: 'u-01' }, 'Jogador 01', neon) === 'Fem Light',
  'membro encontra a categoria real da dupla pelo uid');
ok(win._profileMetaTournamentCategory({}, 'Jogador 02', neon) === 'Fem Light',
  'dupla manual sem uid ainda encontra a categoria real pelo nome');
ok(win._profileMetaTournamentCategory({ category: 'Masc Power' }, 'Ignorado', neon) === 'Masc Power',
  'categoria direta da inscrição tem precedência sobre qualquer lookup do elenco');

console.log('\n' + (fail ? '❌' : '✅') + ' neon-agenda-categoria-contract: ' + pass + ' ok, ' + fail + ' falharam');
if (fail) process.exit(1);

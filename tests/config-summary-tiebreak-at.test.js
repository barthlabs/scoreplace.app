// Pedido do dono (22/jul): no resumo da configuração, "tiebreak 7pts" não dizia EM QUE PLACAR o
// tie-break entra — que é justamente o que muda entre Beach Tennis (5-5) e Tênis (6-6). Agora a
// linha mostra (5-5)/(6-6), derivado da MESMA fonte que o placar ao vivo usa pra disparar o TB
// (_tbLoserGames) — nada de recalcular a regra no resumo. [[project_live_scoring_canonical]]
const { window: W } = require('./render-harness');
require('vm').runInContext(
  require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'views', 'tournaments-utils.js'), 'utf8'),
  W, { filename: 'tournaments-utils.js' });

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const box = (sport, scoring) => String(W._buildTournamentConfigBox(
  { id: 'T', sport: sport, scoring: scoring, format: 'Liga', gameTypes: 'duplas', teamSize: 2 }, {}) || '')
  .replace(/<[^>]+>/g, ' ');

console.log('\n── resumo da configuração indica ONDE o tie-break entra ──');

const TB = { type: 'sets', setsToWin: 1, gamesPerSet: 6, countingType: 'tennis', tiebreakEnabled: true, tiebreakPoints: 7 };

// Beach Tennis: set curto — TB em 5-5 (regra do esporte, _sportTiebreakAt)
ok(box('Beach Tennis', TB).indexOf('tiebreak 7pts (5-5)') !== -1, 'Beach Tennis :: (5-5)');
// Tênis: TB em 6-6
ok(box('Tênis', Object.assign({}, TB, { setsToWin: 2 })).indexOf('tiebreak 7pts (6-6)') !== -1, 'Tênis :: (6-6)');
// Regra EXPLÍCITA do torneio vence o default do esporte, e acompanha o nº de games do set
ok(box('Tênis', Object.assign({}, TB, { gamesPerSet: 9, tiebreakAt: 'g-1' })).indexOf('tiebreak 7pts (8-8)') !== -1,
   'explícito g-1 em set de 9 :: (8-8)');
ok(box('Beach Tennis', Object.assign({}, TB, { tiebreakAt: 'g' })).indexOf('tiebreak 7pts (6-6)') !== -1,
   'explícito g no Beach Tennis :: (6-6) — sobrepõe o padrão do esporte');
// Sem tiebreak: não inventa placar nenhum
ok(box('Beach Tennis', { type: 'sets', setsToWin: 1, gamesPerSet: 6, tiebreakEnabled: false }).indexOf('tiebreak') === -1,
   'sem tiebreak :: não menciona');

console.log(fail === 0 ? `✅ config-summary-tiebreak-at: OK  (${pass} asserts ok)` : `❌ ${fail} FALHA(S)  (${pass} ok)`);
if (fail) { console.log('\nFALHAS:'); fails.forEach((f) => console.log('  ✗ ' + f)); }
process.exit(fail === 0 ? 0 : 1);

/* L7 — o configurador Format 2 só declara intenção ao servidor.
 *
 * O incidente que esta trava evita é o painel antigo recompilar fases no navegador e
 * salvar o torneio inteiro. Um aparelho com um snapshot anterior podia reabrir uma
 * chave já sorteada ou apagar estado concorrente. A página deve chamar a porta estreita
 * `applyTournamentFormat`; a CF relê o documento, autoriza a organização, veta chave
 * existente e recompila a configuração com o mesmo FORMAT2 vendorado do sorteio.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let ok = 0, bad = 0;
function check(label, condition) {
  if (condition) { ok++; console.log('  ✓ ' + label); }
  else { bad++; console.log('  ✗ ' + label); }
}
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error('marcador ausente: ' + start + ' / ' + end);
  return source.slice(a, b);
}

const page = fs.readFileSync(path.join(root, 'js/views/format2-ui.js'), 'utf8');
const applyPage = between(page, 'window._f2ApplyPage = function () {', '\n  };\n})();');
check('a página chama a CF applyTournamentFormat', /_callCF\('applyTournamentFormat'/.test(applyPage));
check('a página manda apenas tournamentId e fmt2', /tournamentId:\s*String\(S\.tId\)[\s\S]*fmt2:\s*S\.cfg/.test(applyPage));
check('a página não salva o documento do torneio', !/saveTournament|mutateTournament|commitTournamentTx/.test(applyPage));
check('a página não recompila nem zera chave localmente', !/compileToPhases|Object\.assign\(t|t\.(?:matches|rounds|groups|standings)\s*=/.test(applyPage));

const cf = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
const applyCf = between(cf, 'exports.applyTournamentFormat = onCall', '\nexports.advanceTournamentPhase = onCall');
check('a CF é callable autenticada', /request\.auth/.test(applyCf));
check('a CF relê e grava em transação', /db\.runTransaction/.test(applyCf) && /_leTorneio\(tx, ref, tId\)/.test(applyCf) && /_gravaTorneio\(tx, ref, t, antes/.test(applyCf));
check('a CF exige organização', /_isTournamentAdmin\(t, uid\)/.test(applyCf));
check('a CF não aceita alteração depois de chave sorteada', /hasDrawnBracket\(t\)/.test(applyCf));
check('a CF recompila fmt2 com o compilador vendorado', /drawWindow\.FORMAT2\.compileToPhases\(fmt2/.test(applyCf));
check('a CF não aceita fases nem partidas prontas do cliente', !/data\.(?:phases|matches|rounds|topLevel)/.test(applyCf));

console.log('\nL7 Format 2: ' + ok + ' ok, ' + bad + ' falharam');
process.exitCode = bad ? 1 : 0;

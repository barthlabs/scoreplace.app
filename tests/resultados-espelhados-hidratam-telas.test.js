/* O espelho results/{matchId} precisa chegar à chave e às novidades. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let ok = 0, fail = 0;
function must(v, m) { if (v) ok++; else { fail++; console.error('✗ ' + m); } }
const store = fs.readFileSync(path.join(root, 'js/store.js'), 'utf8');
const bracket = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'js/views/dashboard.js'), 'utf8');
must(/_hydrateResultPromises/.test(store), 'coalesce por torneio impede leituras concorrentes');
must(/loadMatchResults\(tournamentId\)/.test(store), 'hidratação lê o espelho de resultados');
must(/_overlayResultOnMatch/.test(store), 'hidratação aplica o resultado ao match estrutural');
must(/_resultsHydrated/.test(bracket) && /hydrateMatchResults/.test(bracket), 'abrir a chave dispara uma hidratação controlada');
must(/_resultsHydrated/.test(dashboard) && /_dashPedirRepintura\('resultados-hidratados'\)/.test(dashboard), 'dashboard repinta novidades após hidratar');
must(/participacoes\.concat\(organizados\)/.test(dashboard) && /_dashResultsSeen/.test(dashboard) && /_dashGamesTournaments\.forEach/.test(dashboard), 'dashboard também hidrata e mostra novidade do organizador, sem duplicar participação');
console.log('──── resultados espelhados hidratam telas ────');
console.log('  ' + ok + ' passaram, ' + fail + ' falharam');
process.exitCode = fail ? 1 : 0;

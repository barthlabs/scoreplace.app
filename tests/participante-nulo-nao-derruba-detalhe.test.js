/* Um snapshot parcial pode conter um slot nulo em participants. O card do torneio
 * deve ignorar o slot, mantendo o detalhe navegável. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments.js'), 'utf8');
const store = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
const explore = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'explore.js'), 'utf8');
const router = fs.readFileSync(path.join(__dirname, '..', 'js', 'router.js'), 'utf8');
let fail = 0;
function ok(condition, message) { if (!condition) { fail++; console.error('  ✗ ' + message); } }
const start = src.indexOf('// Participantes já inscritos individualmente');
const end = src.indexOf('// Para duplas', start);
const block = src.slice(start, end);
ok(start >= 0, 'bloco de inscritos individuais existe');
ok(/if \(p == null\) return false;/.test(block), 'slot nulo é descartado antes de ler o perfil');
ok(/p\.displayName \|\| p\.name/.test(block), 'nome continua sendo resolvido para entradas válidas');
const profileLoader = store.slice(store.indexOf('window._loadParticipantProfilesByName'), store.indexOf('// Patch dos slots', store.indexOf('window._loadParticipantProfilesByName')));
ok(/forEach\(function\(p\) \{\s*\/\/[\s\S]*?if \(p == null\) return;/.test(profileLoader), 'hidratação de perfis descarta slot nulo antes de ler displayName');
const exploreMatcher = explore.slice(explore.indexOf('function _participantMatchesUser'), explore.indexOf('// ---- User card HTML builder ----'));
ok(/function _participantMatchesUser\(p, email, displayName, uid\) \{\s*if \(p == null\) return false;/.test(exploreMatcher), 'Explorar descarta slot nulo antes de ler email ou nome');
const dashboardRoute = router.slice(router.indexOf("case 'dashboard':"), router.indexOf("case 'tournament':"));
const tournamentRoute = router.slice(router.indexOf("case 'tournament':"), router.indexOf("case 'pair':"));
ok(!dashboardRoute.includes('window._showLoading(') && !tournamentRoute.includes('window._showLoading('), 'navegação não abre overlay global que bloqueia os cliques');
console.log((fail ? '❌' : '✅') + ' participante-nulo-nao-derruba-detalhe: ' + (fail ? fail + ' falharam' : '6 ok'));
process.exit(fail ? 1 : 0);

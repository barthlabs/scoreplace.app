/* Um snapshot parcial pode conter um slot nulo em participants. O card do torneio
 * deve ignorar o slot, mantendo o detalhe navegável. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const _R = require('./recorte.js');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments.js'), 'utf8');
const store = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
const explore = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'explore.js'), 'utf8');
const router = fs.readFileSync(path.join(__dirname, '..', 'js', 'router.js'), 'utf8');
const analytics = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-analytics.js'), 'utf8');
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
ok(/function _participantMatchesUser\(p, uid\) \{\s*if \(p == null\) return false;/.test(exploreMatcher), 'Explorar descarta slot nulo antes de ler identidade');
const dashboardRoute = router.slice(router.indexOf("case 'dashboard':"), router.indexOf("case 'tournament':"));
const tournamentRoute = router.slice(router.indexOf("case 'tournament':"), router.indexOf("case 'pair':"));
ok(!dashboardRoute.includes('window._showLoading(') && !tournamentRoute.includes('window._showLoading('), 'navegação não abre overlay global que bloqueia os cliques');

// O relato real não era só o primeiro detalhe: cartão → Voltar → MESMO cartão
// trocava a hash, mas o router preservava a dashboard ao capturar a exceção do histórico.
// Executamos o mesmo construtor duas vezes sobre o mesmo torneio, com o slot parcial que
// produzia a exceção. O participante válido continua visível nas duas aberturas.
const analyticsStart = analytics.indexOf('window._buildActivityLog = function');
const buildActivityLog = _R.ateOFim(analytics, analyticsStart);
ok(analyticsStart >= 0, 'construtor do histórico de atividades existe');
ok(/if \(p == null\) return;/.test(buildActivityLog), 'histórico descarta o slot nulo antes de ler enrolledAt');
{
  const container = {
    _html: '',
    set innerHTML(value) { this._html = value; },
    get innerHTML() { return this._html; },
    querySelector: function () { return null; }
  };
  const tournament = {
    id: 'mesmo-torneio',
    createdAt: '2026-09-27T10:00:00Z',
    participants: [null, { displayName: 'Participante válido', enrolledAt: '2026-09-27T11:00:00Z' }]
  };
  const nomesResolvidos = [];
  const W = {
    _findTournamentById: function (id) { return id === tournament.id ? tournament : null; },
    _pName: function (p) { nomesResolvidos.push(p.displayName); return p.displayName || p.name || '?'; },
    _safeHtml: function (s) { return String(s); }
  };
  try {
    vm.runInNewContext(buildActivityLog, { window: W, document: { getElementById: function () { return container; } }, Array: Array, Object: Object, Date: Date });
    W._buildActivityLog(tournament.id); // primeiro toque
    const primeiraAbertura = container.innerHTML;
    W._buildActivityLog(tournament.id); // Voltar → mesmo cartão
    const segundaAbertura = container.innerHTML;
    ok(primeiraAbertura.includes('(2 eventos)'), 'primeira abertura mantém o evento do participante válido');
    ok(segundaAbertura.includes('(2 eventos)'), 'segunda abertura do mesmo cartão também renderiza o detalhe');
    ok(nomesResolvidos.join('|') === 'Participante válido|Participante válido',
      'nas duas aberturas, só o participante válido é resolvido (o slot nulo não chega ao leitor)');
  } catch (e) {
    ok(false, 'histórico não lança com slot nulo nas duas aberturas: ' + e.message);
  }
}

console.log((fail ? '❌' : '✅') + ' participante-nulo-nao-derruba-detalhe: ' + (fail ? fail + ' falharam' : '11 ok'));
process.exit(fail ? 1 : 0);

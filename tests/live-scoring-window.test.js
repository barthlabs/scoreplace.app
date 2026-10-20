const assert = require('node:assert/strict');
const H = require('./headless.js');
H.load('bracket-ui.js');
const w = H.window;

const match = {
  id: 'jogo-1',
  p1: 'Jogador sem perfil (a) / Jogador sem perfil (b)',
  p2: 'Jogador sem perfil (c) / Jogador sem perfil (d)'
};
const secondMatch = { id: 'jogo-2', p1: 'Elenco antigo / Elenco antigo', p2: 'Elenco antigo / Elenco antigo' };
const tournament = { id: 'sb-tour', matches: [match, secondMatch] };
w.AppStore = { currentUser: { uid: 'org' } };
w._findTournamentById = id => id === tournament.id ? tournament : null;
w._findMatch = (t, id) => t.matches.find(m => m.id === id);
w._souOrganizador = () => true;
w._slotUidsPositional = (m, side) => m.id === 'jogo-1'
  ? (side === 'p1' ? ['u1', 'u2'] : ['u3', 'u4'])
  : (side === 'p1' ? ['u5', 'u6'] : ['u7', 'u8']);
w._isOrphanLabel = s => /Jogador sem perfil/.test(s);
const names = { u1: 'Maira Cavalcanti', u2: 'Juliana Penha', u3: 'Flavia Cocozza', u4: 'Juliana Carneiro',
  u5: 'Patricia Paixao', u6: 'Catia Cavedon', u7: 'Marilia Rodrigues', u8: 'Juliana Dal Sasso' };
w._nameForUid = uid => names[uid] || '';
assert.equal(w._liveScoringSideNames(tournament, match, 'p1'), 'Maira Cavalcanti / Juliana Penha');
assert.equal(w._liveScoringSideNames(tournament, match, 'p2'), 'Flavia Cocozza / Juliana Carneiro');
assert.equal(w._liveScoringSideNames(tournament, secondMatch, 'p1'), 'Patricia Paixao / Catia Cavedon');

w.screen = { width: 1440 };
w.matchMedia = () => ({ matches: true });
w.location = { origin: 'https://scoreplace.app', pathname: '/' };
let opened;
w.open = (url, name, features) => {
  opened = { url, name, features };
  return { focus() {} };
};
w._openLiveScoringForMatch('sb-tour', 'jogo-2');
assert.equal(opened.url, 'https://scoreplace.app/#tournaments/sb-tour?live=jogo-2');
assert.match(opened.features, /width=1180/);

let fallback = null;
const realRouteOpener = w._openLiveScoringFromRoute;
w.open = () => null;
w._openLiveScoringFromRoute = (tid, mid, force) => { fallback = [tid, mid, force]; };
w._openLiveScoringForMatch('sb-tour', 'jogo-1');
assert.deepEqual(fallback, ['sb-tour', 'jogo-1', true], 'popup bloqueado usa o próprio jogo');
w._openLiveScoringFromRoute = realRouteOpener;

let preloaded, scored;
w._preloadUserProfiles = ids => { preloaded = ids; return Promise.resolve(); };
w._openLiveScoring = (tid, mid) => { scored = [tid, mid]; };
w.document = { getElementById: () => null };
w._openLiveScoringFromRoute('sb-tour', 'jogo-2');
setImmediate(() => {
  assert.deepEqual(Array.from(preloaded), ['u5', 'u6', 'u7', 'u8']);
  assert.deepEqual(scored, ['sb-tour', 'jogo-2']);
  scored = null;
  w._openLiveScoringFromRoute('sb-tour', 'jogo-2');
  assert.equal(scored, null, 'atualização da rota não reabre controle fechado');
  console.log('✓ janela independente e quatro nomes vivos do jogo clicado');
});

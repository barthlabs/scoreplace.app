'use strict';
/*
 * ESTADO OPERACIONAL SÓ É ATUAL APÓS CONFIRMAÇÃO DO SERVIDOR (E3)
 * node tests/estado-operacional-confirmado-pelo-servidor.test.js
 *
 * O SDK pode entregar IndexedDB primeiro. Isso é útil para a fila durável de
 * escrita, mas é proibido como leitura de listas, W.O., jogos, resultados,
 * presença, placar, perfil, notificações e descoberta. Este teste mantém o
 * inventário fechado: novo ouvinte só entra com metadata + porta canônica.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Freshness = require(path.join(ROOT, 'js/domain/realtime-freshness.js'));
let ok = 0;
function must(condition, message) { assert.ok(condition, message); ok++; console.log('  ✓ ' + message); }

console.log('──── estado operacional confirmado pelo servidor ────');

must(Freshness.isRemoteSnapshot({ metadata: { fromCache: true } }) === false,
  'snapshot do cache nunca é confirmação de estado');
must(Freshness.isRemoteSnapshot({ metadata: { fromCache: false } }) === true,
  'eco remoto confirma o estado');
must(Freshness.listenerOptions().includeMetadataChanges === true,
  'todo ouvinte recebe o eco remoto mesmo sem delta de documentos');
must(Freshness.serverReadOptions().source === 'server',
  'leitura de recuperação exige o servidor');

const listeners = [
  ['js/store.js', 6],             // torneios, sandbox, discovery, notificações, perfil
  ['js/presence-db.js', 2],       // minha presença e amigos
  ['js/views/presence.js', 1],    // pessoas no local
  ['js/views/bracket-ui.js', 2],  // partida casual e espectador ao vivo
  ['js/views/live-now.js', 1],    // painel Ao Vivo
];
listeners.forEach(([rel, expected]) => {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const configured = (src.match(/\.onSnapshot\(\{ includeMetadataChanges: true \}, function\s*/g) || []).length;
  must(configured === expected, rel + ' tem ' + expected + ' ouvinte(s) com metadata remota');
  must(!/\.onSnapshot\(function/.test(src), rel + ' não mantém ouvinte sem confirmação de origem');
  must((src.match(/_isRemoteFirestoreSnapshot\(/g) || []).length >= expected,
    rel + ' recusa o snapshot local antes de alterar a tela');
});

const db = fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8');
function method(name) {
  const start = db.indexOf('async ' + name);
  assert.ok(start >= 0, 'método presente: ' + name);
  const end = db.indexOf('\n  async ', start + 8);
  return db.slice(start, end < 0 ? db.length : end);
}
[
  'loadMatchResults(tournamentId, opts)',
  'loadMatchResult(tournamentId, matchId)',
  'loadMyMatchResults(uid, opts)',
  'loadAllTournaments(opts)',
  'loadMyTournaments(uid, opts)',
  'loadAllPublicTournaments(opts)',
  'carregarPerfilPublico(uid)',
  'loadUserProfile(uid)',
].forEach((name) => must(/get\(\{ source: 'server' \}\)/.test(method(name)),
  name + ' não aceita cache como resposta atual'));

const store = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
must(/loadMyTournaments\(_uid, \{ requireRemote: true \}\)/.test(store),
  'o fallback dos meus torneios pede confirmação remota');
must(/loadAllTournaments\(\{ requireRemote: true \}\)/.test(store),
  'o fallback amplo pede confirmação remota');
must(/requireRemote: true/.test(store.slice(store.indexOf('async loadPublicDiscovery'), store.indexOf('async loadFromFirestore'))),
  'a descoberta preserva a última lista confirmada quando a rede falha');
const fallback = store.slice(store.indexOf('async loadFromFirestore'), store.indexOf('// Load user profile'));
must(/_lastRemoteLoadError/.test(fallback) && !/this\.tournaments = \[\]/.test(fallback),
  'falha de recuperação não inventa uma lista vazia');
must(/_setServerFreshness\('waiting'\)/.test(fallback)
  && /_setServerFreshness\('current'\)/.test(fallback)
  && /_setServerFreshness\('unavailable'\)/.test(fallback),
  'a recuperação comunica espera, confirmação remota e indisponibilidade');
const listenerStart = store.slice(store.indexOf('startRealtimeListener(email)'), store.indexOf('// v1.9.92: gatilho tempo-real da descoberta pública'));
must(/_setServerFreshness\('waiting'\)/.test(listenerStart)
  && /_setServerFreshness\('current'\)/.test(listenerStart)
  && /_setServerFreshness\('unavailable'\)/.test(listenerStart),
  'o ouvinte principal comunica espera, confirmação remota e indisponibilidade');
const vendorCopy = fs.readFileSync(path.join(ROOT, 'functions-autodraw/copy-vendor.js'), 'utf8');
const drawCore = fs.readFileSync(path.join(ROOT, 'functions-autodraw/draw-core.js'), 'utf8');
must(/'realtime-freshness\.js'/.test(vendorCopy)
  && /ScoreplaceRealtimeFreshness = require\('\.\/vendor\/realtime-freshness\.js'\)/.test(drawCore)
  && /_isRemoteFirestoreSnapshot = g\.window\.ScoreplaceRealtimeFreshness\.isRemoteSnapshot/.test(drawCore),
  'o vendor do sorteio recebe e registra o mesmo contrato de frescor');
const main = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
must(/_setServerFreshness/.test(main) && /Sem confirmação do servidor/.test(main),
  'a interface identifica quando o servidor não confirmou atualização');

console.log('\n✅ estado operacional confirmado pelo servidor — ' + ok + ' verificações');

/* Regressão: o replay resolve o nome de apresentação por UID; nome gravado só serve
 * a registros legados. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'js', 'views', 'match-replay.js'), 'utf8');

assert.match(source, /function nomeDoJogador\(p\)/,
  'o replay precisa de um resolvedor de rótulo do jogador');
assert.match(source, /p\.uid && typeof window\._nameForUid === 'function'/,
  'o resolvedor deve consultar o perfil público pelo UID');
assert.match(source, /var nomeAtual = window\._nameForUid\(p\.uid\);\s*if \(nomeAtual\) return nomeAtual;/,
  'o nome atual do perfil deve ter precedência');
assert.match(source, /return p\.name \|\| '';/,
  'nome persistido deve ser apenas fallback de legado');
assert.match(source, /p1Name: t1\.join\(' \/ '\) \|\| 'Time 1'/,
  'a ausência transitória do perfil não pode abrir placar com rótulo vazio');
assert.doesNotMatch(source, /loadUserProfile\s*\(/,
  'o replay não pode abrir leitura privada de perfil');

const replay = { v: 2, points: [{ w: 1 }], totalPoints: 1 };
const torneio = { id: 't', name: 'Teste', sport: 'Tênis',
  matches: [{ id: 'm', p1: 'A', p2: 'B', sets: [[6, 3]], replay }],
  _results: { m: { replay: { points: [{ w: 2 }] } } } };
let opened = null;
const window = { AppStore: { tournaments: [torneio] },
  _findTournamentById: () => torneio,
  _collectAllMatches: t => t.matches,
  _openLiveScoring: (_a, _b, options) => { opened = options; } };
vm.runInNewContext(source, { window });
window._openMatchReplayFromBracket('t', 'm');
assert(opened && opened.replay === replay,
  'a chave abre o replay do jogo canônico, não a cópia antiga em _results');
assert.equal(JSON.stringify(opened.recordSets), JSON.stringify([[6, 3]]));

console.log('✅ match-replay-uid-reader: OK');

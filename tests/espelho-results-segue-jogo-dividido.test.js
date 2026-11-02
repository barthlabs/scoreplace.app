'use strict';
// E05: a fonte do jogo dividido é matches/{id}.jogo; o gatilho não projeta results.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const split = require(path.join(root, 'functions/vendor/tournament-split-core.js'));
const retired = ['syncSplitMatchResult', 'syncSplitEnrollmentResults',
  'retryMirrorReconcilePending', 'sweepMirrorReconcilePending'];
for (const name of retired) {
  assert.doesNotMatch(source, new RegExp('exports\\.' + name + '\\s*='),
    name + ' não deve recriar results');
}
assert.doesNotMatch(source, /_projetarEspelhoOuEnfileirar|_mirrorTransaction|_mirrorQueue/,
  'nenhum escritor de espelho permanece no código ativo');
const start = source.indexOf('exports.syncMatchRosters = onDocumentWritten(');
const end = source.indexOf('// ─── FOTO DO LOCAL:', start);
assert(start >= 0 && end > start, 'gatilho da raiz permanece');
const rootTrigger = source.slice(start, end);
assert.match(rootTrigger, /_rosterWatch\.detectarTrocaDeEscalacao/);
assert.match(rootTrigger, /_rosterMirror\.planRosterMirror/);
assert.match(rootTrigger, /_woReconcile\.planejar/);
assert.match(rootTrigger, /_colJog\.doc\(p\._id\), p\.camposAlterados/);
assert.doesNotMatch(rootTrigger, /results|mirrorReconcilePending/,
  'gatilho da raiz não escreve resultados espelhados');
assert(split.partesDe({}).includes('matches'),
  'jogo dividido continua parte canônica mesmo sem marcador legado');
assert.match(source, /exports\.purgeTournamentCopies[\s\S]*?\.listCollections\(\)/,
  'exclusão do torneio continua enumerando results antigos');
assert.doesNotMatch(source, /exports\.backfillMatchResultDocs\s*=/,
  'backfill aposentado não recria resultados');
console.log('✓ E05: gatilhos de results aposentados; roster, W.O. e purge preservados');

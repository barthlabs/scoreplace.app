/* Regressão: contagem de participações classificatórias no backfill deve partir
 * de `phases`, nunca do texto histórico do formato do torneio. */
const fs = require('fs');
const path = require('path');
const R = require('./recorte.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
let fail = 0;
function ok(condition, message) {
  if (condition) return;
  fail++;
  console.error('✗ ' + message);
}

const start = src.indexOf('function _hasClassificationPhase(t)');
const body = R.ateOFim(src, start);
ok(start >= 0, 'backfill possui a porta _hasClassificationPhase');
ok(/phase\.kind === "classification"/.test(body), 'fase classification é reconhecida explicitamente');
ok(/if \(phases\.length\)/.test(body), 'fases canônicas têm precedência sobre texto legado');
ok(/if \(_hasClassificationPhase\(t\)\)/.test(src), 'contador usa a porta canônica');

console.log((fail ? '✗' : '✓') + ' backfill-stats-phases: ' + (4 - fail) + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);

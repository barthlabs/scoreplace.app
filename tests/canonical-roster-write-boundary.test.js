'use strict';

/* A fronteira de escrita é a última defesa: mesmo que um motor de partidas
 * transforme a projeção em memória, inscrições canônicas nunca podem voltar a
 * ser persistidas pelo espelho legado. */
const fs = require('fs');
let failed = 0;
function ok(value, message) {
  console.log((value ? '✓ ' : '✗ ') + message);
  if (!value) failed++;
}

const source = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const helperStart = source.indexOf('function _preserveCanonicalRosterProjection');
const helperEnd = source.indexOf('// Uma única porta para a temporada acabar.', helperStart);
const helper = source.slice(helperStart, helperEnd);
ok(helperStart >= 0 && /migration\.fingerprint/.test(helper),
  'fronteira reconhece exclusivamente o recibo canônico');
['participants', 'standbyParticipants', 'waitlist'].forEach(function (field) {
  ok(helper.includes("'" + field + "'"), field + ' é restaurado da projeção anterior, nunca do mutador');
});
ok(/JSON\.parse\(JSON\.stringify\(tAntes\[key\]\)\)/.test(helper),
  'a cópia preservada não compartilha referência com o mutador da callable');

const writeStart = source.indexOf('function _gravaTorneio');
const writeEnd = source.indexOf('/* Devolve ao estado do banco toda vaga', writeStart);
const write = source.slice(writeStart, writeEnd);
const preserveAt = write.indexOf('_preserveCanonicalRosterProjection(tDepois, tAntes)');
const reconcileAt = write.indexOf('_rosterState.reconcileRosterStates');
ok(preserveAt >= 0 && reconcileAt > preserveAt,
  'a proteção ocorre antes de qualquer reconciliação legada');
ok(/if \(!_rosterCanonico\) \{[\s\S]*?_rosterState\.reconcileRosterStates/.test(write),
  'reconciliador legado não roda em inscrições canônicas');
ok(!/if \(_rosterCanonico\) \{[\s\S]*?_rosterState\.reconcileRosterStates/.test(write),
  'não existe rota canônica que reative o reconciliador do espelho');

process.exitCode = failed ? 1 : 0;

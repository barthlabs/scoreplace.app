'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateNewFormatIntent } = require('../functions-autodraw/format-intent-validation-core');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }

const valid = {
  disputa: 'dupla', parceria: 'fixa', formacaoDupla: 'manual',
  classifScope: 'per_group', rodadas: { modo: 'todos', turnos: 'ida' },
  classificationPairing: { strategy: 'free_draw', rematchPolicy: 'exhaust_cluster_before_repeat' },
  classificationSchedule: { gamesPerUnit: 3, mode: 'structured' },
  eliminatoria: { formacao: 'performance', lateEnrollment: 'inherit', newMatchups: false, linhas: 2 }
};
assert.doesNotThrow(() => validateNewFormatIntent(valid, HttpsError));
assert.doesNotThrow(() => validateNewFormatIntent({ disputa: 'individual', parceria: null }, HttpsError));
assert.doesNotThrow(() => validateNewFormatIntent({ parceria: null }, HttpsError));
assert.doesNotThrow(() => validateNewFormatIntent({ eliminatoria: { ativa: false } }, HttpsError));

for (const [patch, field] of [
  [{ disputa: 'equipe' }, 'disputa'],
  [{ parceria: 'aleatoria' }, 'parceria'],
  [{ rodadas: { modo: 'infinito' } }, 'rodadas.modo'],
  [{ classificationPairing: { strategy: 'desconhecida' } }, 'classificationPairing.strategy'],
  [{ classificationSchedule: { gamesPerUnit: 3, mode: 'structred' } }, 'classificationSchedule.mode'],
  [{ eliminatoria: { linhas: 3 } }, 'eliminatoria.linhas'],
  [{ eliminatoria: { newMatchups: 'yes' } }, 'eliminatoria.newMatchups']
]) {
  assert.throws(() => validateNewFormatIntent(patch, HttpsError), error =>
    error.code === 'invalid-argument' && error.message.includes('fmt2.' + field), field);
}
assert.throws(() => validateNewFormatIntent([], HttpsError), { code: 'invalid-argument' });

const server = fs.readFileSync(path.join(__dirname, '..', 'functions-autodraw', 'index.js'), 'utf8');
const compiler = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'format2.js'), 'utf8');
const editor = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'format2-ui.js'), 'utf8');
assert.match(compiler, /out\.rodadas\.modo !== 'todos' && out\.rodadas\.modo !== 'fixo'/);
assert.match(editor, /_f2Modo\(\\'fixo\\'\).*_f2Modo\(\\'todos\\'\)/s);
assert.match(compiler, /out\.rodadas\.turnos === 'ida_volta'\) \? 'ida_volta' : 'ida'/);
assert.match(editor, /_f2Turnos\(this\.checked \? \\'ida_volta\\' : \\'ida\\'\)/);
assert.match(compiler, /\[1, 2, 4\]\.indexOf\(e\.linhas\)/);
assert.match(editor, /\[1, 2, 4\]\.map\(function \(n\).*_f2Linhas/s);
assert.match(compiler, /mode: value\.mode === 'structured' \? 'structured' : 'free'/);
assert.match(editor, /current\.mode = mode === 'structured' \? 'structured' : 'free'/);
const FORMAT2 = require('../functions-autodraw/draw-core')._window.FORMAT2;
const historical = FORMAT2.normalize({ disputa: 'dupla', parceria: 'antiga', rodadas: { modo: 'legacy' },
  eliminatoria: { linhas: 3, lateEnrollment: 'legacy' } }, 'Beach Tennis');
assert.doesNotThrow(() => validateNewFormatIntent(historical, HttpsError), 'dialeto histórico normalizado pela UI continua editável');
assert.match(server, /validateIntent: require\('\.\/format-intent-validation-core'\)\.validateNewFormatIntent/);
assert.match(server, /const fmt2Clone = _clonaConfigDeclarativa\(fmt2, 0, \['fmt2'\]\);\s*require\('\.\/format-intent-validation-core'\)\.validateNewFormatIntent\(fmt2Clone, HttpsError\)/);

// Executa o handler exportado, extraído literalmente do módulo de produção.
// A transação fake contabiliza qualquer escrita, inclusive se uma futura mudança
// trocar a ordem entre compilar, validar e gravar.
const start = server.indexOf('exports.applyTournamentFormat = onCall(async (request) => {');
const end = server.indexOf('\nexports.advanceTournamentPhase = onCall(', start);
assert(start >= 0 && end > start, 'handler real de edição encontrado');
const handlerSource = server.slice(start, end);
let compiled = 0;
let writes = 0;
const tournament = { id: 'tour_test', creatorUid: 'owner', sport: 'Tênis', matches: [], phases: [] };
const db = {
  collection: () => ({ doc: id => ({ id }) }),
  runTransaction: async callback => callback({
    set: () => { writes++; }, update: () => { writes++; }, create: () => { writes++; }, delete: () => { writes++; }
  })
};
const drawWindow = { FORMAT2: { compileToPhases: () => { compiled++; return { topLevel: {}, phases: [], cfg: {} }; }, summary: () => '' } };
const edit = new Function('onCall', 'HttpsError', 'db', 'drawWindow', '_leTorneio', '_isTournamentAdmin',
  'hasDrawnBracket', '_clonaConfigDeclarativa', '_drawFail', '_antesDoMotor', '_gravaTorneio', 'require',
  'const exports = {};\n' + handlerSource + '\nreturn exports.applyTournamentFormat;')(
  fn => fn, HttpsError, db, drawWindow, async () => tournament, () => true, () => false,
  value => structuredClone(value), (code, message) => new HttpsError(code, message),
  () => ({}), () => { writes++; return { clean: tournament }; },
  require('node:module').createRequire(path.join(__dirname, '..', 'functions-autodraw', 'index.js'))
);

(async () => {
  await assert.rejects(edit({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', fmt2: { disputa: 'dupla', classificationSchedule: { mode: 'structred' } }
  } }), error => error.code === 'invalid-argument' && error.message.includes('fmt2.classificationSchedule.mode'));
  assert.equal(compiled, 0, 'rejeita antes do compilador');
  assert.equal(writes, 0, 'rejeita antes de qualquer escrita');
  const legacyEdit = await edit({ auth: { uid: 'owner' }, data: { tournamentId: 'tour_test', fmt2: historical } });
  assert.equal(legacyEdit.ok, true, 'edição de dialeto histórico normalizado pela UI segue aceita');
  assert.equal(compiled, 1);
  assert.equal(writes, 1);
  console.log('✓ intenção nova rejeita enum inválido nas duas portas de escrita');
})().catch(error => { console.error(error); process.exitCode = 1; });

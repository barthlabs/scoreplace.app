'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateNewFormatIntent } = require('../functions-autodraw/format-intent-validation-core');
const { makeCreateTournament } = require('../functions-autodraw/tournament-create');
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
assert.doesNotThrow(() => validateNewFormatIntent({ classificationSchedule: null, rodadas: { modo: 'todos' } }, HttpsError));
assert.doesNotThrow(() => validateNewFormatIntent({ grupos: 20, classificationPairing: { clusterSize: 100 } }, HttpsError), 'não impõe teto novo em edição histórica');
assert.doesNotThrow(() => validateNewFormatIntent({ grupos: '20', classificationSchedule: { gamesPerUnit: '3' } }, HttpsError));

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
const invalidContainers = ['rodadas', 'classificationPairing', 'eliminatoria'].flatMap(field =>
  [null, 'texto', [], 7].map(value => ({ field, fmt2: { [field]: value } })));
for (const { field, fmt2 } of invalidContainers) {
  assert.throws(() => validateNewFormatIntent(fmt2, HttpsError), error =>
    error.code === 'invalid-argument' && error.message.includes('fmt2.' + field), field);
}

for (const [patch, field] of [
  [{ grupos: '3abc' }, 'grupos'], [{ grupos: 3.5 }, 'grupos'],
  [{ grupos: '' }, 'grupos'], [{ grupos: ' 3' }, 'grupos'],
  [{ grupos: '1e2' }, 'grupos'], [{ grupos: 0 }, 'grupos'],
  [{ classificados: -1 }, 'classificados'], [{ classificados: null }, 'classificados'],
  [{ rodadas: { n: '' } }, 'rodadas.n'], [{ rodadas: { n: 1.5 } }, 'rodadas.n'],
  [{ classificationPairing: { clusterSize: 1 } }, 'classificationPairing.clusterSize'],
  [{ classificationPairing: { clusterSize: Infinity } }, 'classificationPairing.clusterSize'],
  [{ classificationSchedule: {} }, 'classificationSchedule.gamesPerUnit'],
  [{ classificationSchedule: { gamesPerUnit: null } }, 'classificationSchedule.gamesPerUnit'],
  [{ classificationSchedule: { gamesPerUnit: '3abc' } }, 'classificationSchedule.gamesPerUnit'],
  [{ classificationSchedule: { gamesPerUnit: 3.5 } }, 'classificationSchedule.gamesPerUnit'],
  [{ classificationSchedule: [] }, 'classificationSchedule']
]) {
  assert.throws(() => validateNewFormatIntent(patch, HttpsError), error =>
    error.code === 'invalid-argument' && error.message.includes('fmt2.' + field), field);
}

const server = fs.readFileSync(path.join(__dirname, '..', 'functions-autodraw', 'index.js'), 'utf8');
const cloneStart = server.indexOf('function _clonaConfigDeclarativa(');
const cloneEnd = server.indexOf('function _fasesDeConfiguracaoAtualizaveis(', cloneStart);
assert(cloneStart >= 0 && cloneEnd > cloneStart, 'clone real de configuração encontrado');
const cloneConfig = new Function('HttpsError', server.slice(cloneStart, cloneEnd) +
  '\nreturn _clonaConfigDeclarativa;')(HttpsError);
assert.equal(cloneConfig(null, 0, ['fmt2', 'rodadas']), null);
assert(Array.isArray(cloneConfig([], 0, ['fmt2', 'rodadas'])), 'clone real preserva arrays');
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
const wideHistorical = FORMAT2.normalize({ grupos: 20, classificationPairing: { clusterSize: 100 } }, 'Beach Tennis');
assert.equal(wideHistorical.grupos, 20);
assert.doesNotThrow(() => validateNewFormatIntent(wideHistorical, HttpsError), 'normalizado histórico com mais de 16 grupos segue editável');
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
  cloneConfig, (code, message) => new HttpsError(code, message),
  () => ({}), () => { writes++; return { clean: tournament }; },
  require('node:module').createRequire(path.join(__dirname, '..', 'functions-autodraw', 'index.js'))
);

(async () => {
  let createCompiled = 0, createTransactions = 0;
  const create = makeCreateTournament({
    db: { collection: () => ({ doc: id => ({ id }) }), runTransaction: async () => { createTransactions++; } },
    HttpsError, FieldValue: { serverTimestamp: () => 'now' },
    fields: new Set(['name', 'sport', 'format', 'fmt2']),
    cloneConfig,
    validateIntent: validateNewFormatIntent,
    compile: () => { createCompiled++; return { topLevel: {}, phases: [], cfg: {} }; },
    boundary: value => ({ persist: value, clean: value }),
    readTournament: async () => null,
    now: () => Date.now()
  });
  await assert.rejects(create({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_' + Date.now() + '_' + 'a'.repeat(32),
    config: { name: 'Teste', sport: 'Beach Tennis', format: 'Liga',
      fmt2: { classificationSchedule: { gamesPerUnit: '3abc' } } }
  } }), error => error.code === 'invalid-argument' && error.message.includes('fmt2.classificationSchedule.gamesPerUnit'));
  assert.equal(createCompiled, 0, 'criação rejeita antes de compilar');
  assert.equal(createTransactions, 0, 'criação rejeita antes da transação');
  await assert.rejects(edit({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', fmt2: { disputa: 'dupla', classificationSchedule: { mode: 'structred' } }
  } }), error => error.code === 'invalid-argument' && error.message.includes('fmt2.classificationSchedule.mode'));
  assert.equal(compiled, 0, 'rejeita antes do compilador');
  assert.equal(writes, 0, 'rejeita antes de qualquer escrita');
  await assert.rejects(edit({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', fmt2: { classificationSchedule: { gamesPerUnit: 3.5 } }
  } }), error => error.code === 'invalid-argument' && error.message.includes('fmt2.classificationSchedule.gamesPerUnit'));
  assert.equal(compiled, 0, 'edição rejeita número alterado antes do compilador');
  assert.equal(writes, 0, 'edição rejeita número alterado antes de escrever');
  for (const { field, fmt2 } of invalidContainers) {
    await assert.rejects(create({ auth: { uid: 'owner' }, data: {
      tournamentId: 'tour_' + Date.now() + '_' + 'a'.repeat(32),
      config: { name: 'Teste', sport: 'Beach Tennis', format: 'Liga', fmt2 }
    } }), error => error.code === 'invalid-argument' && error.message.includes('fmt2.' + field));
    assert.equal(createCompiled, 0, field + ': criação não compila');
    assert.equal(createTransactions, 0, field + ': criação não abre transação');
    await assert.rejects(edit({ auth: { uid: 'owner' }, data: {
      tournamentId: 'tour_test', fmt2
    } }), error => error.code === 'invalid-argument' && error.message.includes('fmt2.' + field));
    assert.equal(compiled, 0, field + ': edição não compila');
    assert.equal(writes, 0, field + ': edição não escreve');
  }
  const legacyEdit = await edit({ auth: { uid: 'owner' }, data: { tournamentId: 'tour_test', fmt2: historical } });
  assert.equal(legacyEdit.ok, true, 'edição de dialeto histórico normalizado pela UI segue aceita');
  assert.equal(compiled, 1);
  assert.equal(writes, 1);
  const wideEdit = await edit({ auth: { uid: 'owner' }, data: { tournamentId: 'tour_test', fmt2: wideHistorical } });
  assert.equal(wideEdit.ok, true, 'edição histórica com mais de 16 grupos não é bloqueada');
  assert.equal(compiled, 2);
  assert.equal(writes, 2);
  console.log('✓ intenção nova rejeita valor e contêiner inválidos nas duas portas de escrita');
})().catch(error => { console.error(error); process.exitCode = 1; });

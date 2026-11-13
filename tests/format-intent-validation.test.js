'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateNewFormatIntent, validateHistoricalSinglesIdentity, validateCompletedMixedIdentity } = require('../functions-autodraw/format-intent-validation-core');
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
assert.doesNotThrow(() => validateNewFormatIntent({ tieResolution: 'singles_then_draw' }, HttpsError));
assert.doesNotThrow(() => validateNewFormatIntent({ tieResolution: 'singles_then_draw', tieSinglesPoints: 5,
  tieSinglesMargin: 1 }, HttpsError));
assert.throws(() => validateNewFormatIntent({ tieSinglesPoints: 100 }, HttpsError), { code: 'invalid-argument' });
assert.throws(() => validateNewFormatIntent({ tieSinglesMargin: 3 }, HttpsError), { code: 'invalid-argument' });
assert.doesNotThrow(() => validateNewFormatIntent({ disputa: 'dupla', parceria: 'super_eight' }, HttpsError));
assert.doesNotThrow(() => validateNewFormatIntent({ disputa: 'individual', parceria: null }, HttpsError));
assert.doesNotThrow(() => validateNewFormatIntent({ parceria: null }, HttpsError));
assert.doesNotThrow(() => validateNewFormatIntent({ eliminatoria: { ativa: false } }, HttpsError));
assert.doesNotThrow(() => validateNewFormatIntent({ eliminatoria: { linhas: 3 } }, HttpsError));
assert.doesNotThrow(() => validateNewFormatIntent({ eliminatoria: { linhas: 5 } }, HttpsError));
assert.doesNotThrow(() => validateNewFormatIntent({ teamCompetition: { schedule: {
  originDayPolicy: 'organizer-pair-days' } } }, HttpsError));
assert.throws(() => validateNewFormatIntent({ teamCompetition: { schedule: {
  originDayPolicy: 'female-light-organization-final' } } }, HttpsError), { code: 'invalid-argument' });
assert.doesNotThrow(() => validateNewFormatIntent({ teamCompetition: { schedule: {
  originDayPolicy: 'female-light-organization-final' } } }, HttpsError,
{ rulesContractVersion: 1 }), 'a política antiga só é lida em torneios históricos');
assert.doesNotThrow(() => validateNewFormatIntent({ eliminatoria: { finalSeriesBestOf: 9 } }, HttpsError));
assert.throws(() => validateNewFormatIntent({ eliminatoria: { finalSeriesBestOf: 4 } }, HttpsError), { code: 'invalid-argument' });
assert.throws(() => validateNewFormatIntent({ eliminatoria: { finalSeriesBestOf: 3, grandFinalReset: true } }, HttpsError), { code: 'invalid-argument' });
assert.throws(() => validateNewFormatIntent({ eliminatoria: { lateEnrollment: 'closed', newMatchups: true } }, HttpsError),
  { code: 'invalid-argument', message: 'Novos confrontos exigem inscrições abertas na fase eliminatória.' });
assert.throws(() => validateNewFormatIntent({ eliminatoria: { lateEnrollment: 'closed', newMatchups: true } },
  HttpsError, { rulesContractVersion: 2 }), { code: 'invalid-argument' });
assert.doesNotThrow(() => validateNewFormatIntent({ eliminatoria: { lateEnrollment: 'closed', newMatchups: true } },
  HttpsError, { rulesContractVersion: 1 }), 'eco de configuração histórica não é migração implícita');
assert.doesNotThrow(() => validateNewFormatIntent({ classificationSchedule: null, rodadas: { modo: 'todos' } }, HttpsError));
assert.doesNotThrow(() => validateNewFormatIntent({ grupos: 20, classificationPairing: { clusterSize: 100 } }, HttpsError), 'não impõe teto novo em edição histórica');
assert.doesNotThrow(() => validateNewFormatIntent({ grupos: '20', classificationSchedule: { gamesPerUnit: '3' } }, HttpsError));

const historicalSingles = { disputa: 'individual', historicalSinglesOverride: true };
const storedSingles = { teamSize: 1, fmt2: historicalSingles };
assert.doesNotThrow(() => validateNewFormatIntent(historicalSingles, HttpsError, storedSingles, 1));
assert.doesNotThrow(() => validateHistoricalSinglesIdentity(storedSingles, 1, HttpsError));
for (const requested of ['1', '01', ' 1', 2, '2']) {
  assert.throws(() => validateNewFormatIntent(historicalSingles, HttpsError, storedSingles, requested),
    { code: 'failed-precondition' });
  assert.throws(() => validateHistoricalSinglesIdentity(storedSingles, requested, HttpsError),
    { code: 'failed-precondition' });
}
assert.doesNotThrow(() => validateHistoricalSinglesIdentity({ teamSize: '1', fmt2: historicalSingles }, '1', HttpsError));
assert.throws(() => validateHistoricalSinglesIdentity({ teamSize: '1', fmt2: historicalSingles }, 1, HttpsError),
  { code: 'failed-precondition' });
assert.throws(() => validateNewFormatIntent(historicalSingles, HttpsError, undefined, undefined),
  { code: 'failed-precondition', message: 'Atualize o app para editar este torneio.' });
assert.throws(() => validateNewFormatIntent({ disputa: 'individual' }, HttpsError, storedSingles, 1),
  { code: 'failed-precondition', message: 'Atualize o app para editar este torneio.' });
for (const value of [null, false, 'true', 1]) {
  assert.throws(() => validateNewFormatIntent({ disputa: 'individual', historicalSinglesOverride: value }, HttpsError),
    { code: 'invalid-argument' });
}
assert.throws(() => validateNewFormatIntent({ disputa: 'dupla', historicalSinglesOverride: true }, HttpsError, storedSingles, 1),
  { code: 'invalid-argument' });
assert.throws(() => validateNewFormatIntent(historicalSingles, HttpsError, { fmt2: historicalSingles }, 1),
  { code: 'failed-precondition' });

for (const [patch, field] of [
  [{ disputa: 'equipe' }, 'disputa'],
  [{ parceria: 'aleatoria' }, 'parceria'],
  [{ tieResolution: 'new_draw' }, 'tieResolution'],
  [{ rodadas: { modo: 'infinito' } }, 'rodadas.modo'],
  [{ classificationPairing: { strategy: 'desconhecida' } }, 'classificationPairing.strategy'],
  [{ classificationSchedule: { gamesPerUnit: 3, mode: 'structred' } }, 'classificationSchedule.mode'],
  [{ eliminatoria: { linhas: '3abc' } }, 'eliminatoria.linhas'],
  [{ eliminatoria: { semeadura: 'aleatoria' } }, 'eliminatoria.semeadura'],
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
  [{ eliminatoria: { linhas: 0 } }, 'eliminatoria.linhas'],
  [{ eliminatoria: { linhas: 1.5 } }, 'eliminatoria.linhas'],
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
assert.throws(() => validateNewFormatIntent({ eliminatoria: { linhas: 33 } }, HttpsError),
  { code: 'invalid-argument', message: 'São permitidas no máximo 32 chaves paralelas.' });

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
assert.match(compiler, /e\.linhas = Math\.max\(1, Math\.min\(32, parseInt\(e\.linhas, 10\) \|\| 1\)\)/);
assert.match(editor, /type="number"[^\n]*onchange="window\._f2Linhas\(this\.value\)"/);
assert.match(compiler, /mode: value\.mode === 'structured' \? 'structured' : 'free'/);
assert.match(editor, /current\.mode = mode === 'structured' \? 'structured' : 'free'/);
const FORMAT2 = require('../functions-autodraw/draw-core')._window.FORMAT2;
const openingMonarch = FORMAT2.defaultConfig('Beach Tennis');
openingMonarch.classifAtiva = false;
openingMonarch.eliminatoria.openReiRainha = true;
openingMonarch.tieResolution = 'singles_then_draw';
assert.equal(FORMAT2.normalize(openingMonarch).tieResolution, 'singles_then_draw',
  'rodada Rei/Rainha no início da eliminatória preserva a simples de desempate');
const seedingCfg = FORMAT2.defaultConfig('Beach Tennis');
seedingCfg.parceria = 'fixa';
seedingCfg.eliminatoria.formacao = 'performance';
seedingCfg.eliminatoria.semeadura = 'equilibrio';
let seededPhase = FORMAT2.compileToPhases(seedingCfg, { sport: 'Beach Tennis' }).phases.at(-1);
assert.equal(seededPhase.pairingStrategy, 'top');
assert.equal(seededPhase.bracketSeeding, 'balanced', 'organizador escolhe confronto sem mudar pareamento');
seedingCfg.eliminatoria.formacao = 'equilibrio';
seedingCfg.eliminatoria.semeadura = 'performance';
seededPhase = FORMAT2.compileToPhases(seedingCfg, { sport: 'Beach Tennis' }).phases.at(-1);
assert.equal(seededPhase.pairingStrategy, 'balanced');
assert.equal(seededPhase.bracketSeeding, 'seed', 'organizador escolhe pareamento sem mudar confronto');
seedingCfg.eliminatoria.semeadura = 'sorteio';
seededPhase = FORMAT2.compileToPhases(seedingCfg, { sport: 'Beach Tennis' }).phases.at(-1);
assert.equal(seededPhase.bracketSeeding, 'draw', 'sorteio da posição na chave chega à fase');
delete seedingCfg.eliminatoria.semeadura;
seededPhase = FORMAT2.compileToPhases(seedingCfg, { sport: 'Beach Tennis' }).phases.at(-1);
assert.equal(seededPhase.bracketSeeding, 'balanced', 'configuração antiga conserva a semeadura derivada');
seedingCfg.classifAtiva = false;
seedingCfg.eliminatoria.openReiRainha = true;
seedingCfg.eliminatoria.semeadura = 'performance';
assert.equal(FORMAT2.compileToPhases(seedingCfg, { sport: 'Beach Tennis' }).phases[1].bracketSeeding, 'seed',
  'rodada inicial Rei/Rainha também respeita a decisão independente');
const uiHarness = require('./headless');
const uiBox = { innerHTML: '' };
uiHarness.window.document = { getElementById: id => id === 'f2-config-mount' ? uiBox : null };
uiHarness.load('format2-ui.js');
const uiCfg = uiHarness.window.FORMAT2.defaultConfig('Beach Tennis');
uiCfg.parceria = 'fixa';
uiHarness.window._f2MountInForm(uiBox, 'Beach Tennis', uiCfg, { id: 'future-test' });
assert.match(uiBox.innerHTML, /Confrontos na chave/, 'organizador vê a decisão de semeadura');
assert.match(uiBox.innerHTML, /Saída escolhida: a classificatória seleciona participantes para a eliminatória/);
const decisionTitles = ['4. 🎯 Fase Classificatória', '5. 🏆 Fase Eliminatória', '6. Revisão das decisões'];
assert.deepStrictEqual(decisionTitles.map(title => uiBox.innerHTML.indexOf(title)).filter(index => index >= 0).length,
  decisionTitles.length, 'o fluxo exibe só as seções que controlam decisões');
assert.deepStrictEqual(decisionTitles.map(title => uiBox.innerHTML.indexOf(title)).slice().sort((a, b) => a - b),
  decisionTitles.map(title => uiBox.innerHTML.indexOf(title)), 'as seções seguem a ordem fixa');
assert.doesNotMatch(uiBox.innerHTML, /Quem disputa os jogos\?|Como se formam as duplas\?/,
  'perguntas estáticas antigas não ocupam espaço no formulário');
assert.match(uiBox.innerHTML, /Simples[\s\S]*?Duplas[\s\S]*?Inscrição individual[\s\S]*?Dupla formada/,
  'modalidade e inscrição são escolhas explícitas');
assert.equal((uiBox.innerHTML.match(/onchange="window\._f2TeamCompetition\(this\.checked\)"/g) || []).length, 1,
  'a decisão de ter times aparece uma vez dentro da classificatória');
uiHarness.window._f2TeamCompetition(true);
assert.equal(uiHarness.window._f2GetConfig().teamCompetition.enabled, true,
  'a escolha antecipada por times chega à configuração do torneio');
assert.match(uiBox.innerHTML, /Pontuação agregada para times/,
  'os detalhes de pontuação surgem após escolher times');
uiHarness.window._f2TeamCompetition(false);
uiHarness.window._f2Semeadura('equilibrio');
assert.equal(uiHarness.window._f2GetConfig().eliminatoria.semeadura, 'equilibrio',
  'o clique persiste na configuração que será enviada ao servidor');
uiHarness.window._f2Semeadura('sorteio');
assert.equal(uiHarness.window._f2GetConfig().eliminatoria.semeadura, 'sorteio',
  'o organizador também pode escolher sorteio da posição na chave');
uiHarness.window._f2Elim(false);
assert.match(uiBox.innerHTML, /Saída escolhida: classificação final de dupla, sem eliminatória/);
assert.match(uiBox.innerHTML, /Não há partida de disputa de 3º e 4º lugar/);
assert.match(uiBox.innerHTML, /5\. 🏆 Fase Eliminatória/, 'o bloco desligado permanece visível');
assert.doesNotMatch(uiBox.innerHTML, /Confrontos na chave/, 'o bloco desligado recolhe as decisões da chave');
uiHarness.window._f2Elim(true);
uiHarness.window._f2ClassifAtiva(false);
assert.match(uiBox.innerHTML, /4\. 🎯 Fase Classificatória/, 'o bloco desligado permanece visível');
assert.doesNotMatch(uiBox.innerHTML, /Pontuação agregada para times/, 'entrada direta recolhe a pontuação de times');
assert.match(uiBox.innerHTML, /5\. 🏆 Fase Eliminatória/, 'entrada direta mantém a eliminatória');
const mixedCfg = FORMAT2.defaultConfig('Futevôlei');
mixedCfg.disputa = 'dupla';
mixedCfg.parceria = 'fixa';
mixedCfg.classifAtiva = true;
mixedCfg.grupos = 2;
mixedCfg.classificados = 4;
mixedCfg.eliminatoria.ativa = false;
mixedCfg.completedMixedGroupOnly = true;
const mixedCompiled = FORMAT2.compileToPhases(mixedCfg, { sport: 'Futevôlei' });
const storedMixed = { id: 'tour_test', creatorUid: 'owner', sport: 'Futevôlei',
  status: 'finished', matches: [], ...mixedCompiled.topLevel,
  phases: mixedCompiled.phases, fmt2: mixedCompiled.cfg };
assert.doesNotThrow(() => validateNewFormatIntent(storedMixed.fmt2, HttpsError, storedMixed, 2));
assert.doesNotThrow(() => validateCompletedMixedIdentity(storedMixed, 2, HttpsError));
for (const requested of [1, '2']) {
  assert.throws(() => validateCompletedMixedIdentity(storedMixed, requested, HttpsError),
    { code: 'failed-precondition' });
}
for (const [scope, key, value] of [
  ['top', 'teamSize', 1], ['top', 'status', 'active'],
  ['top', 'gruposCount', 3], ['top', 'gruposClassified', 2],
  ['top', 'politicaDaChave', 'bye'],
  ['phase', 'gruposCount', 4], ['phase', 'fixedPairs', false]
]) {
  const wrong = structuredClone(storedMixed);
  (scope === 'top' ? wrong : wrong.phases[0])[key] = value;
  assert.throws(() => validateCompletedMixedIdentity(wrong, wrong.teamSize, HttpsError),
    { code: 'failed-precondition' }, scope + '.' + key);
}
const mixedWithNextPhase = structuredClone(storedMixed);
mixedWithNextPhase.phases.push({ kind: 'elimination' });
assert.throws(() => validateCompletedMixedIdentity(mixedWithNextPhase, 2, HttpsError),
  { code: 'failed-precondition' });
assert.throws(() => validateNewFormatIntent(storedMixed.fmt2, HttpsError),
  { code: 'failed-precondition' }, 'criação não pode forjar marcador');
assert.throws(() => validateNewFormatIntent({ disputa: 'dupla' }, HttpsError, storedMixed, 2),
  { code: 'failed-precondition' }, 'cliente antigo não remove marcador');
assert.throws(() => validateNewFormatIntent({ disputa: 'individual', completedMixedGroupOnly: true },
  HttpsError, storedMixed, 2), { code: 'invalid-argument' });
for (const value of [false, null, 'true']) {
  assert.throws(() => validateNewFormatIntent({ disputa: 'dupla', completedMixedGroupOnly: value },
    HttpsError), { code: 'invalid-argument' });
}
const historical = FORMAT2.normalize({ disputa: 'dupla', parceria: 'antiga', rodadas: { modo: 'legacy' },
  eliminatoria: { linhas: 3, lateEnrollment: 'legacy' } }, 'Beach Tennis');
assert.doesNotThrow(() => validateNewFormatIntent(historical, HttpsError), 'dialeto histórico normalizado pela UI continua editável');
const wideHistorical = FORMAT2.normalize({ grupos: 20, classificationPairing: { clusterSize: 100 } }, 'Beach Tennis');
assert.equal(wideHistorical.grupos, 20);
assert.doesNotThrow(() => validateNewFormatIntent(wideHistorical, HttpsError), 'normalizado histórico com mais de 16 grupos segue editável');
assert.match(server, /validateIntent: require\('\.\/format-intent-validation-core'\)\.validateNewFormatIntent/);
assert.match(server, /const fmt2Clone = _clonaConfigDeclarativa\(fmt2, 0, \['fmt2'\]\);\s*require\('\.\/format-intent-validation-core'\)\.validateNewFormatIntent\(fmt2Clone, HttpsError, t, t\.teamSize\)/);

// Executa o handler exportado, extraído literalmente do módulo de produção.
// A transação fake contabiliza qualquer escrita, inclusive se uma futura mudança
// trocar a ordem entre compilar, validar e gravar.
const start = server.indexOf('exports.applyTournamentFormat = onCall(async (request) => {');
const end = server.indexOf('\nexports.advanceTournamentPhase = onCall(', start);
assert(start >= 0 && end > start, 'handler real de edição encontrado');
const handlerSource = server.slice(start, end);
let compiled = 0;
let writes = 0;
let tournament = { id: 'tour_test', creatorUid: 'owner', sport: 'Tênis', matches: [], phases: [], rulesContractVersion: 2 };
const db = {
  collection: () => ({ doc: id => ({ id }) }),
  runTransaction: async callback => callback({
    set: () => { writes++; }, update: () => { writes++; }, create: () => { writes++; }, delete: () => { writes++; }
  })
};
const drawWindow = { FORMAT2: { compileToPhases: (fmt2, context) => {
  compiled++;
  return fmt2.historicalSinglesOverride === true || fmt2.completedMixedGroupOnly === true
    ? FORMAT2.compileToPhases(fmt2, context)
    : { topLevel: {}, phases: [], cfg: {} };
}, summary: () => '' } };
const edit = new Function('onCall', 'HttpsError', 'db', 'drawWindow', '_leTorneio', '_isTournamentAdmin',
  'hasDrawnBracket', '_clonaConfigDeclarativa', '_drawFail', '_antesDoMotor', '_gravaTorneio', '_phaseTieCore', 'require',
  'const exports = {};\n' + handlerSource + '\nreturn exports.applyTournamentFormat;')(
  fn => fn, HttpsError, db, drawWindow, async () => tournament, () => true, () => false,
  cloneConfig, (code, message) => new HttpsError(code, message),
  () => ({}), () => { writes++; return { clean: tournament }; }, require('../functions-autodraw/phase-tie-core'),
  require('node:module').createRequire(path.join(__dirname, '..', 'functions-autodraw', 'index.js'))
);

// A terceira entrada de fmt2 é a ficha geral. Extrair o handler literalmente
// evita testar apenas o validador puro e deixar a porta transacional descoberta.
const configStart = server.indexOf('exports.updateTournamentConfiguration = onCall(async (request) => {');
const configEnd = server.indexOf('\n// ─── Ciclo presencial:', configStart);
assert(configStart >= 0 && configEnd > configStart, 'handler real da ficha encontrado');
const configSource = server.slice(configStart, configEnd);
assert(configSource.indexOf('const validatedWindow = patch.scheduleWindow') > -1 &&
  configSource.indexOf('const validatedWindow = patch.scheduleWindow') <
    configSource.indexOf('!Array.isArray(validatedWindow.days)'),
  'a janela efetiva é declarada no escopo antes da validação da grade');
const categoryGuardStart = server.indexOf('async function _assertCategoryConfigBeforeDraw(tx, ref, t) {');
const categoryGuardEnd = server.indexOf('\n// Uma lista de rótulos', categoryGuardStart);
assert(categoryGuardStart >= 0 && categoryGuardEnd > categoryGuardStart, 'guarda real de categorias encontrada');
const categoryGuard = new Function('hasDrawnBracket', 'HttpsError', '_tSplit',
  server.slice(categoryGuardStart, categoryGuardEnd) + '\nreturn _assertCategoryConfigBeforeDraw;')(
  () => false, HttpsError, require('../js/views/tournament-split-core.js'));
let configWrites = 0;
let categoryProjections = 0;
let configSplitPart = '';
const configDrawWindow = {};
const activePhases = new Function('HttpsError', '_CONFIG_FASE_ATIVA', '_clonaConfigDeclarativa',
  server.slice(server.indexOf('function _fasesDeConfiguracaoAtualizaveis('),
    server.indexOf('// Pedidos de criação duram 24 horas.', server.indexOf('function _fasesDeConfiguracaoAtualizaveis('))) +
  '\nreturn _fasesDeConfiguracaoAtualizaveis;')(HttpsError,
  new Set(['name', 'startDate', 'endDate', 'roundBounds']), cloneConfig);
let configTournament = { id: 'tour_test', creatorUid: 'owner', sport: 'Beach Tennis', fmt2: {} };
const configDb = {
  collection: () => ({ doc: id => ({ id, collection: part => ({ part, limit() { return this; } }) }) }),
  runTransaction: async callback => callback({
    get: async ref => ({ empty: ref.part !== configSplitPart,
      docs: ref.part === configSplitPart ? [{ id: 'drawn' }] : [] }),
    set: () => { configWrites++; }, update: () => { configWrites++; },
    create: () => { configWrites++; }, delete: () => { configWrites++; }
  })
};
const configHandler = new Function('onCall', 'HttpsError', 'db', '_CAMPOS_CONFIG_TORNEIO',
  '_CONFIG_ESTRUTURAL', '_clonaConfigDeclarativa', '_assertSandboxDrawOwner', '_leTorneio',
  '_isTournamentAdmin', '_drawFail', 'hasDrawnBracket', '_configAtiva', '_antesDoMotor',
  '_gravaTorneio', '_fasesDeConfiguracaoAtualizaveis', 'drawWindow', 'require',
  '_assertCategoryConfigBeforeDraw', '_categoryDefinitionsForLabels', '_phaseTieCore', 'createHash',
  '_writeCategoryRemoval', '_phaseCallOrder', '_phaseGridPlan',
  'const exports = {};\n' + configSource + '\nreturn exports.updateTournamentConfiguration;')(
  fn => fn, HttpsError, configDb, new Set(['fmt2', 'phases', 'name', 'teamSize', 'gruposClassified', 'politicaDaChave', 'genderCategories', 'combinedCategories', 'gameTypes', 'scheduleWindow', 'isPublic', 'membersOnly', 'organizerOnly', 'courtCount', 'gameDuration', 'callTime', 'warmupTime', 'maxParticipantsPerCategory']), new Set(['fmt2', 'phases', 'teamSize', 'gruposClassified', 'politicaDaChave', 'gameTypes']), cloneConfig,
  async () => {}, async () => configTournament, () => true,
  (code, message) => new HttpsError(code, message), t => Array.isArray(t.matches) && t.matches.length > 0,
  require('../functions-autodraw/config-ativa-core'), () => ({}),
  (_tx, _ref, t) => { configWrites++; return { clean: t }; }, activePhases, configDrawWindow,
  require('node:module').createRequire(path.join(__dirname, '..', 'functions-autodraw', 'index.js')),
  categoryGuard, async (_tx, _ref, _t, labels) => {
    categoryProjections++;
    return labels.map((label) => ({ id: 'cat-' + label, label }));
  }, require('../functions-autodraw/phase-tie-core'), require('node:crypto').createHash,
  (_tx, _ref, _t, removal, reservations) => {
    assert.ok(removal == null, 'edição de formato não remove inscrições de categoria');
    assert.ok(reservations == null, 'edição de formato não altera vagas reservadas');
  }, require('../js/domain/phase-call-order.js'), require('../js/domain/phase-grid-plan.js')
);

(async () => {
  const newContractTournament = tournament;
  tournament = { ...tournament, rulesContractVersion: 1 };
  const writesBeforeLegacyEdit = writes;
  await assert.rejects(edit({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', fmt2: { disputa: 'dupla' }
  } }), { code: 'failed-precondition' }, 'torneio legado aberto não é migrado implicitamente');
  assert.equal(writes, writesBeforeLegacyEdit, 'torneio legado permanece intacto');
  tournament = newContractTournament;
  const openConfigTournament = configTournament;
  configTournament = { ...openConfigTournament, rulesContractVersion: 2, status: 'finished' };
  const writesBeforeFinished = configWrites;
  await assert.rejects(configHandler({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', patch: { name: 'Nome alterado após encerramento' }
  } }), { code: 'failed-precondition', message: 'O torneio já foi encerrado; a configuração publicada não pode ser alterada.' });
  assert.equal(configWrites, writesBeforeFinished, 'torneio encerrado não sofre escrita de configuração');
  configTournament = openConfigTournament;
  const interleavedPlan = require('./fixtures/camis-interleaved-plan.js');
  const phaseCallOrder = require('../js/domain/phase-call-order.js');
  const originalOrder = phaseCallOrder.stages({ scheduleWindow: { interleavedPlan } });
  const reordered = originalOrder.map(stage => ({ ...stage }));
  reordered[3].parallel = false;
  configTournament = { ...openConfigTournament, scheduleWindow: { interleavedPlan, days: [] } };
  const writesBeforeOrder = configWrites;
  const orderSaved = await configHandler({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', patch: { scheduleWindow: { phaseCallOrder: reordered } }
  } });
  assert.equal(orderSaved.ok, true, 'ordem válida é aceita pela função real');
  assert.deepEqual(configTournament.scheduleWindow.phaseCallOrder, reordered);
  assert(configWrites > writesBeforeOrder, 'ordem válida é gravada');
  const invalidOrder = reordered.map(stage => ({ ...stage }));
  invalidOrder[2] = { ...invalidOrder[2], category: invalidOrder[1].category };
  const writesBeforeInvalidOrder = configWrites;
  await assert.rejects(configHandler({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', patch: { scheduleWindow: { phaseCallOrder: invalidOrder } }
  } }), { code: 'invalid-argument' }, 'ordem inválida é rejeitada pela função real');
  assert.equal(configWrites, writesBeforeInvalidOrder, 'ordem inválida não escreve');
  const gridModel = require('../js/domain/phase-grid-plan.js');
  const gridDays = [{ day:'2026-11-13', startTime:'08:00', endTime:'21:00' }];
  const proposal = gridModel.suggest({ days:gridDays, courts:2, gameDuration:25, callTime:5,
    warmupTime:5, eliminationPlayMinutes:25,
    categories:[{ name:'Fem Diamante', groups:2 }, { name:'Fem Ouro', groups:2 }] });
  assert.ok(proposal.plan, 'proposta de grade gerada');
  const emptyGridTournament = { ...openConfigTournament, courtCount:2, gameDuration:25, callTime:5, warmupTime:5,
    combinedCategories:['Fem Diamante', 'Fem Ouro'], maxParticipantsPerCategory:8,
    maxParticipants:16, scheduleWindow:{ days:gridDays } };
  configTournament = structuredClone(emptyGridTournament);
  const saveProposal = await configHandler({ auth:{ uid:'owner' }, data:{ tournamentId:'tour_test',
    patch:{ scheduleWindow:{ days:gridDays, interleavedPlan:{ ...proposal.plan, editorVersion:2 } } } } });
  assert.equal(saveProposal.ok, true, 'proposta nova é gravada antes do sorteio');
  const existingGridTournament = { ...structuredClone(emptyGridTournament),
    scheduleWindow:{ days:gridDays, interleavedPlan:{ ...proposal.plan, editorVersion:2 } } };
  const drawnGridTournament = { ...structuredClone(existingGridTournament), matches:[{ id:'drawn-1' }],
    isPublic:false, membersOnly:false, organizerOnly:true };
  configTournament = structuredClone(drawnGridTournament);
  const visibilityAfterDraw = await configHandler({ auth:{ uid:'owner' }, data:{ tournamentId:'tour_test',
    patch:{ isPublic:true, membersOnly:false, organizerOnly:false,
      courtCount:2, gameDuration:25, callTime:5, warmupTime:5,
      maxParticipantsPerCategory:8,
      scheduleWindow:{ interleavedPlan:structuredClone(existingGridTournament.scheduleWindow.interleavedPlan) } } } });
  assert.equal(visibilityAfterDraw.ok, true, 'visibilidade muda após sorteio com insumos idênticos reenviados');
  assert.equal(configTournament.isPublic, true);
  configTournament = structuredClone(drawnGridTournament);
  await assert.rejects(configHandler({ auth:{ uid:'owner' }, data:{ tournamentId:'tour_test',
    patch:{ isPublic:true, courtCount:3 } } }),
  error => error.code === 'failed-precondition',
  'alterar uma quadra real continua proibido após sorteio');
  configTournament = structuredClone(existingGridTournament);
  const beforeStaleCategoryPlan = configWrites;
  await assert.rejects(configHandler({ auth:{ uid:'owner' }, data:{ tournamentId:'tour_test',
    patch:{ combinedCategories:['Fem Diamante', 'Fem Prata'],
      scheduleWindow:{ interleavedPlan:structuredClone(existingGridTournament.scheduleWindow.interleavedPlan) } } } }),
  { code:'invalid-argument', message:'A grade não corresponde às categorias e vagas atuais. Gere uma nova proposta de horários.' },
  'categoria alterada com a grade salva reenviada é recusada pela divergência de assinaturas');
  assert.equal(configWrites, beforeStaleCategoryPlan, 'grade salva reenviada incompatível não escreve');
  assert.deepEqual(configTournament, existingGridTournament, 'a recusa preserva o documento salvo inteiro');
  const renamedProposal = gridModel.suggest({ days:gridDays, courts:2, gameDuration:25, callTime:5,
    warmupTime:5, eliminationPlayMinutes:25,
    categories:[{ name:'Fem Diamante', groups:2 }, { name:'Fem Prata', groups:2 }] });
  configTournament = structuredClone(existingGridTournament);
  const saveRenamedPlan = await configHandler({ auth:{ uid:'owner' }, data:{ tournamentId:'tour_test',
    patch:{ combinedCategories:['Fem Diamante', 'Fem Prata'],
      scheduleWindow:{ interleavedPlan:{ ...renamedProposal.plan, editorVersion:2 } } } } });
  assert.equal(saveRenamedPlan.ok, true, 'categoria alterada com grade coerente é aceita antes do sorteio');
  assert.deepEqual(configTournament.combinedCategories, ['Fem Diamante', 'Fem Prata']);
  configTournament = structuredClone(existingGridTournament);
  const beforeStaleWithoutPlan = configWrites;
  await assert.rejects(configHandler({ auth:{ uid:'owner' }, data:{ tournamentId:'tour_test',
    patch:{ combinedCategories:['Fem Diamante', 'Fem Prata'] } } }),
  { code:'invalid-argument', message:'A grade não corresponde às categorias e vagas atuais. Gere uma nova proposta de horários.' },
  'alterar categoria sem reenviar a grade também é recusado pela divergência de assinaturas');
  assert.equal(configWrites, beforeStaleWithoutPlan, 'categoria com grade antiga não escreve');
  const forged = structuredClone(proposal.plan);
  forged.blocks[0].category = 'Fem Prata';
  const beforeForged = configWrites;
  await assert.rejects(configHandler({ auth:{ uid:'owner' }, data:{ tournamentId:'tour_test',
    patch:{ scheduleWindow:{ days:gridDays, interleavedPlan:{ ...forged, editorVersion:2 } } } } }),
  { code:'invalid-argument' }, 'proposta com categoria forjada é recusada');
  assert.equal(configWrites, beforeForged, 'proposta inválida não escreve');
  configTournament = { ...structuredClone(emptyGridTournament), maxParticipantsByCategory:{
    'Fem Diamante':'8', 'Fem Ouro':'8'
  } };
  const beforeStringCapacity = configWrites;
  await assert.rejects(configHandler({ auth:{ uid:'owner' }, data:{ tournamentId:'tour_test',
    patch:{ scheduleWindow:{ days:gridDays, interleavedPlan:{ ...proposal.plan, editorVersion:2 } } } } }),
  { code:'invalid-argument' }, 'a validação estrutural anterior recusa vagas serializadas como texto');
  assert.equal(configWrites, beforeStringCapacity, 'vagas em texto não escrevem');
  configTournament = { ...structuredClone(emptyGridTournament), maxParticipantsByCategory:{
    'Fem Diamante':'10', 'Fem Ouro':'8'
  } };
  const beforeInvalidCapacity = configWrites;
  await assert.rejects(configHandler({ auth:{ uid:'owner' }, data:{ tournamentId:'tour_test',
    patch:{ scheduleWindow:{ days:gridDays, interleavedPlan:{ ...proposal.plan, editorVersion:2 } } } } }),
  { code:'invalid-argument' }, 'vagas que não formam quartetos são recusadas');
  assert.equal(configWrites, beforeInvalidCapacity, 'vagas inválidas não escrevem');
  configTournament = openConfigTournament;
  configWrites = 0;

  let createCompiled = 0, createTransactions = 0;
  const create = makeCreateTournament({
    db: { collection: () => ({ doc: id => ({ id }) }), runTransaction: async () => { createTransactions++; } },
    HttpsError, FieldValue: { serverTimestamp: () => 'now' },
    fields: new Set(['name', 'sport', 'format', 'teamSize', 'fmt2', 'lateEnrollment', 'newMatchups']),
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
  await assert.rejects(create({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_' + Date.now() + '_' + 'd'.repeat(32),
    config: { name: 'Entrada fechada', sport: 'Beach Tennis', format: 'Liga',
      lateEnrollment: 'closed', newMatchups: true }
  } }), { code: 'invalid-argument', message: 'Novos confrontos exigem inscrições abertas.' });
  assert.equal(createTransactions, 0, 'combinação incoerente não abre transação');
  await assert.rejects(create({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_' + Date.now() + '_' + 'b'.repeat(32),
    config: { name: 'Individual histórico forjado', sport: 'Futevôlei', format: 'Eliminatórias Simples',
      teamSize: 1, fmt2: historicalSingles }
  } }), { code: 'failed-precondition' });
  assert.equal(createCompiled, 0, 'flag histórica não é criada pelo cliente');
  assert.equal(createTransactions, 0, 'criação com flag não abre transação');
  await assert.rejects(create({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_' + Date.now() + '_' + 'c'.repeat(32),
    config: { name: 'Misto forjado', sport: 'Futevôlei', format: 'Fase de Grupos',
      teamSize: 2, fmt2: storedMixed.fmt2 }
  } }), { code: 'failed-precondition' });
  assert.equal(createTransactions, 0, 'misto forjado não abre transação');
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
  tournament = { id: 'tour_test', creatorUid: 'owner', sport: 'Futevôlei', teamSize: 1,
    matches: [], phases: [], fmt2: historicalSingles };
  const beforeApply = writes;
  await assert.rejects(edit({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', fmt2: { disputa: 'individual' }
  } }), { code: 'failed-precondition', message: 'Atualize o app para editar este torneio.' });
  assert.equal(writes, beforeApply, 'apply não remove flag por cliente antigo');
  const clonedHistorical = cloneConfig(historicalSingles, 0, ['fmt2']);
  assert.equal(clonedHistorical.historicalSinglesOverride, true, 'clone real preserva flag');
  const appliedHistorical = await edit({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', fmt2: clonedHistorical
  } });
  assert.equal(appliedHistorical.ok, true, 'apply recompila histórico individual');
  assert.equal(tournament.teamSize, 1);
  assert.equal(typeof tournament.teamSize, 'number');
  assert.equal(tournament.fmt2.historicalSinglesOverride, true);
  assert.equal(tournament.rulesContractVersion, undefined, 'edição histórica não migra o contrato de encerramento');
  assert.equal(writes, beforeApply + 1);
  for (const [fmt2, field] of [
    [{ disputa: 'equipe' }, 'disputa'],
    [{ grupos: '3abc' }, 'grupos'],
    [{ rodadas: [] }, 'rodadas']
  ]) {
    configTournament = { id: 'tour_test', creatorUid: 'owner', sport: 'Beach Tennis', fmt2: {} };
    await assert.rejects(configHandler({ auth: { uid: 'owner' }, data: {
      tournamentId: 'tour_test', patch: { fmt2 }
    } }), error => error.code === 'invalid-argument' && error.message.includes('fmt2.' + field));
    assert.equal(configWrites, 0, field + ': ficha não escreve');
  }
  for (const schedule of [undefined, { gamesPerUnit: 3, mode: 'free' }]) {
    configTournament = { id: 'tour_test', creatorUid: 'owner', sport: 'Beach Tennis', fmt2: {} };
    const normalized = FORMAT2.normalize({ disputa: 'dupla', parceria: 'fixa',
      ...(schedule ? { classificationSchedule: schedule } : {}) }, 'Beach Tennis');
    assert.equal(schedule ? normalized.classificationSchedule.gamesPerUnit : normalized.classificationSchedule,
      schedule ? 3 : undefined, 'payload da ficha normalizado pelo compilador real');
    const result = await configHandler({ auth: { uid: 'owner' }, data: {
      tournamentId: 'tour_test', patch: { fmt2: normalized }
    } });
    assert.equal(result.ok, true, 'ficha aceita payload normalizado real');
    assert.equal(result.changed, true);
  }
  // Cliente antigo pode reenviar o fmt2 histórico intacto ao editar outro
  // campo. Não transformar leitura/eco em uma nova intenção de formato.
  const oldUnsorted = { disputa: 'dupla', parceria: 'antiga',
    classificationSchedule: { mode: 'free' } };
  configTournament = { id: 'tour_test', creatorUid: 'owner', sport: 'Beach Tennis',
    name: 'Antes', fmt2: oldUnsorted };
  const oldReordered = { classificationSchedule: { mode: 'free' }, parceria: 'antiga', disputa: 'dupla' };
  const oldResult = await configHandler({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', patch: { name: 'Depois', fmt2: oldReordered }
  } });
  assert.equal(oldResult.ok, true, 'nome pode ser editado com formato histórico intacto');
  assert.equal(configTournament.fmt2, oldUnsorted, 'fmt2 histórico não é regravado');
  configTournament = { id: 'tour_test', creatorUid: 'owner', sport: 'Beach Tennis',
    name: 'Antes', fmt2: null };
  const nullEcho = await configHandler({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', patch: { name: 'Depois', fmt2: null }
  } });
  assert.equal(nullEcho.ok, true, 'eco de null histórico não bloqueia nome');
  assert.equal(configTournament.fmt2, null, 'null histórico não é regravado');
  configTournament = { id: 'tour_test', creatorUid: 'owner', sport: 'Beach Tennis',
    name: 'Antes', fmt2: valid };
  const beforeNull = configWrites;
  await assert.rejects(configHandler({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', patch: { fmt2: null }
  } }), error => error.code === 'invalid-argument');
  assert.equal(configWrites, beforeNull, 'substituir formato existente por null não escreve');
  const storedHistoricFormat = { ...historicalSingles, parceria: null,
    classificationSchedule: { mode: 'antigo' } };
  configTournament = { id: 'tour_test', creatorUid: 'owner', sport: 'Futevôlei',
    name: 'Antes', teamSize: 1, fmt2: storedHistoricFormat };
  const echoed = await configHandler({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', patch: { name: 'Depois', fmt2: structuredClone(storedHistoricFormat) }
  } });
  assert.equal(echoed.ok, true, 'fmt2 idêntico com enum antigo não revalida o envelope');
  assert.equal(configTournament.fmt2, storedHistoricFormat, 'fmt2 salvo permanece intacto');
  const withoutEnvelope = await configHandler({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', patch: { name: 'Mais um nome' }
  } });
  assert.equal(withoutEnvelope.ok, true, 'editar nome sem fmt2 mantém identidade histórica');
  for (const patch of [{ teamSize: 2 }, { teamSize: '1' },
    { teamSize: 2, fmt2: structuredClone(storedHistoricFormat) }]) {
    const before = configWrites;
    await assert.rejects(configHandler({ auth: { uid: 'owner' }, data: {
      tournamentId: 'tour_test', patch
    } }), { code: 'failed-precondition' });
    assert.equal(configWrites, before, 'mudança de modalidade não escreve');
  }
  const beforeOldClient = configWrites;
  await assert.rejects(configHandler({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', patch: { fmt2: { disputa: 'individual' } }
  } }), { code: 'failed-precondition', message: 'Atualize o app para editar este torneio.' });
  assert.equal(configWrites, beforeOldClient, 'cliente sem flag não apaga a identidade histórica');

  configTournament = structuredClone(storedMixed);
  const sameMixed = await configHandler({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', patch: { name: 'Nome corrigido', fmt2: structuredClone(storedMixed.fmt2) }
  } });
  assert.equal(sameMixed.ok, true, 'eco do envelope misto preserva edição não estrutural');
  const beforeMixedChange = configWrites;
  for (const patch of [{ teamSize: 1 }, { teamSize: '2' },
    { fmt2: { disputa: 'dupla' } }, { teamSize: 1, fmt2: structuredClone(storedMixed.fmt2) }]) {
    await assert.rejects(configHandler({ auth: { uid: 'owner' }, data: {
      tournamentId: 'tour_test', patch
    } }), { code: 'failed-precondition' });
    assert.equal(configWrites, beforeMixedChange, 'mudança estrutural mista não escreve');
  }
  tournament = structuredClone(storedMixed);
  const beforeMixedApply = writes;
  await assert.rejects(edit({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', fmt2: { disputa: 'dupla' }
  } }), { code: 'failed-precondition' });
  assert.equal(writes, beforeMixedApply, 'apply não remove marcador');
  await assert.rejects(edit({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', fmt2: structuredClone(storedMixed.fmt2)
  } }), { code: 'failed-precondition', message: 'Torneio encerrado não pode receber novo contrato.' });
  assert.equal(writes, beforeMixedApply, 'contrato encerrado permanece intacto');
  assert.equal(tournament.fmt2.completedMixedGroupOnly, true);
  assert.equal(tournament.phases.length, 1);

  const historicDrawn = { disputa: 'dupla', parceria: 'antiga',
    eliminatoria: { roundBounds: ['2026-11-01T23:00'] } };
  configTournament = { id: 'tour_test', creatorUid: 'owner', sport: 'Beach Tennis',
    matches: [{ id: 'jogo-existente' }], fmt2: historicDrawn };
  const deadlineOnly = JSON.parse(JSON.stringify(historicDrawn));
  deadlineOnly.eliminatoria.roundBounds = ['2026-11-02T23:00'];
  const beforeDrawn = configWrites;
  const deadlineResult = await configHandler({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', patch: { fmt2: deadlineOnly }
  } });
  assert.equal(deadlineResult.ok, true, 'prazo em formato histórico com chave passa');
  assert.equal(configWrites, beforeDrawn + 1);
  assert.deepEqual(configTournament.matches, [{ id: 'jogo-existente' }], 'jogos não mudam');
  const drawnHistoricFormat = { ...historicalSingles,
    eliminatoria: { roundBounds: ['2026-11-01T23:00'] } };
  configTournament = { id: 'tour_test', creatorUid: 'owner', sport: 'Futevôlei', teamSize: 1,
    matches: [{ id: 'jogo-existente' }], fmt2: drawnHistoricFormat };
  const newDeadline = structuredClone(drawnHistoricFormat);
  newDeadline.eliminatoria.roundBounds = ['2026-11-03T23:00'];
  const drawnSaved = await configHandler({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', patch: { fmt2: newDeadline }
  } });
  assert.equal(drawnSaved.ok, true, 'prazo de individual histórico sorteado é editável');
  assert.equal(configTournament.fmt2.historicalSinglesOverride, true, 'mescla preserva flag');
  const beforeTypeChange = configWrites;
  await assert.rejects(configHandler({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', patch: { teamSize: '1' }
  } }), { code: 'failed-precondition' });
  assert.equal(configWrites, beforeTypeChange, 'ramo sorteado recusa mudança de tipo');
  configTournament = { id: 'tour_test', creatorUid: 'owner', sport: 'Beach Tennis',
    canonicalRegistrationMigration: { fingerprint: 'native:tour_test', registrationCount: 0 },
    genderCategories: [], combinedCategories: [], categoryDefinitions: [],
    matches: [], groups: [], _nPartes: { matches: 1 }, fmt2: {} };
  const beforeSplit = configWrites;
  await assert.rejects(configHandler({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', patch: { genderCategories: ['Feminino'] }
  } }), error => error.code === 'failed-precondition' && /antes do primeiro sorteio/.test(error.message),
  'ficha recusa categoria se os jogos estão só na parte dividida');
  assert.equal(configWrites, beforeSplit, 'recusa sem escrita na ficha');
  assert.equal(categoryProjections, 0, 'categoria sorteada não chega à projeção');
  for (const part of ['matches', 'grupos', 'woClaims']) {
    configSplitPart = require('../js/views/tournament-split-core.js').colecaoDaParte(part);
    configTournament = { id: 'tour_test', creatorUid: 'owner', sport: 'Beach Tennis',
      canonicalRegistrationMigration: { fingerprint: 'native:tour_test', registrationCount: 0 },
      genderCategories: [], combinedCategories: [], categoryDefinitions: [],
      matches: [], groups: [], _nPartes: {}, fmt2: {} };
    await assert.rejects(configHandler({ auth: { uid: 'owner' }, data: {
      tournamentId: 'tour_test', patch: { genderCategories: ['Feminino'] }
    } }), error => error.code === 'failed-precondition' && /antes do primeiro sorteio/.test(error.message),
    'ficha recusa categoria com contador zero e documento na subcoleção ' + part);
    assert.equal(configWrites, beforeSplit, part + ' dividido não causa escrita');
  }
  configSplitPart = '';
  configTournament = { id: 'tour_test', creatorUid: 'owner', sport: 'Beach Tennis',
    canonicalRegistrationMigration: { fingerprint: 'native:tour_test', registrationCount: 0 },
    genderCategories: ['Feminino'], combinedCategories: ['Feminino'], categoryDefinitions: [],
    matches: [], groups: [], fmt2: {}, gameTypes: 'simples' };
  const changedGameType = await configHandler({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', patch: { gameTypes: 'duplas', combinedCategories: ['Feminino Duplas'] }
  } });
  assert.equal(changedGameType.ok, true, 'mudança de tipo pré-sorteio pode recompor categorias');
  assert.equal(categoryProjections, 1, 'mudança de tipo projetou a nova categoria tipada');
  const currentChoice = FORMAT2.defaultConfig('Beach Tennis');
  currentChoice.grupos = 2;
  currentChoice.classifScope = 'per_group';
  const currentFormat = FORMAT2.compileToPhases(currentChoice, { sport: 'Beach Tennis' });
  configTournament = { id: 'tour_test', creatorUid: 'owner', sport: 'Beach Tennis', teamSize: 2,
    rulesContractVersion: 2, status: 'active', fmt2: currentFormat.cfg, phases: currentFormat.phases,
    currentPhaseIndex: 0, _phaseMaterialized: 0,
    matches: [{ id: 'resultado-publicado', phaseIndex: 0, winner: 'A' }] };
  const phaseZeroBefore = structuredClone(configTournament.phases[0]);
  const oldFutureHash = require('node:crypto').createHash('sha256')
    .update(JSON.stringify(configTournament.fmt2)).digest('hex');
  configDrawWindow.FORMAT2 = FORMAT2;
  const futureChoice = structuredClone(configTournament.fmt2);
  futureChoice.classifScope = 'overall';
  futureChoice.classificados = 4;
  futureChoice.eliminatoria.linhas = 3;
  futureChoice.eliminatoria.nomes = ['Céu', 'Mar', 'Terra'];
  futureChoice.eliminatoria.politicaDaChave = 'bye';
  const futureCompiled = FORMAT2.compileToPhases(futureChoice, { sport: 'Beach Tennis' });
  const resultFuture = await configHandler({ auth: { uid: 'owner' }, data: { tournamentId: 'tour_test',
    patch: { fmt2: futureChoice, phases: futureCompiled.phases,
      gruposClassified: futureCompiled.topLevel.gruposClassified,
      politicaDaChave: futureCompiled.topLevel.politicaDaChave } } });
  assert.equal(resultFuture.ok, true, 'ficha aceita reconfigurar fase futura ainda sem jogos');
  assert.equal(configTournament.phases[1].mapping.length, 3);
  assert.equal(configTournament.gruposClassified, 4);
  assert.equal(configTournament.politicaDaChave, 'bye');
  assert.equal(configTournament.fmt2.classifScope, 'overall');
  assert.equal(configTournament.phases[1].source.scope, 'overall', 'escopo altera apenas a origem da fase futura');
  assert.deepEqual(configTournament.phases[0], phaseZeroBefore, 'fase atual sorteada não é recompilada');
  assert.equal(configTournament.matches[0].winner, 'A', 'jogo da fase corrente permanece intacto');
  assert.equal(configTournament.futureConfigRevisionsV2.length, 1, 'revisão futura guarda identidade e hashes');
  assert.equal(configTournament.futureConfigRevisionsV2[0].previousHash, oldFutureHash);
  assert.equal(configTournament.futureConfigRevisionsV2[0].nextHash,
    require('node:crypto').createHash('sha256').update(JSON.stringify(configTournament.fmt2)).digest('hex'));
  configTournament.currentPhaseIndex = 1;
  const laterChoice = structuredClone(configTournament.fmt2);
  laterChoice.eliminatoria.linhas = 4;
  await assert.rejects(configHandler({ auth: { uid: 'owner' }, data: { tournamentId: 'tour_test',
    patch: { fmt2: laterChoice } } }), { code: 'failed-precondition' });
  console.log('✓ intenção nova rejeita valor e contêiner inválidos nas duas portas de escrita');
})().catch(error => { console.error(error); process.exitCode = 1; });

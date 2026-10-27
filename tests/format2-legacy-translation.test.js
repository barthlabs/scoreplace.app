'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['js/views/sport-rules.js', 'js/domain/team-competition.js', 'js/views/format2.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
}
assert.equal(sandbox.SPORT_RULES['Tênis'].teamSize, 1);
assert.equal(sandbox.SPORT_RULES['Beach Tennis'].teamSize, 2);
const F = sandbox.FORMAT2;
const formSource = fs.readFileSync(path.join(root, 'js/views/create-tournament.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(root, 'js/views/format2-ui.js'), 'utf8');
assert.match(formSource, /initCfg = JSON\.parse\(JSON\.stringify\(tourn\.fmt2\)\)/);
assert.match(formSource, /window\._f2MountInForm\(mount, sport, initCfg, tourn\)/);
assert.match(formSource, /tourData\.fmt2 = _f2cfg/);
assert.match(uiSource, /window\._f2GetConfig = function \(\) \{ return \(S && S\.mode === 'form'\) \? window\.FORMAT2\.normalize\(S\.cfg, S\.sport\)/);

function fixture(sport, teamSize) {
  const cfg = F.defaultConfig(sport);
  cfg.disputa = teamSize === 1 ? 'individual' : 'dupla';
  cfg.classifAtiva = true;
  cfg.grupos = 2;
  cfg.rodadas.modo = 'todos';
  cfg.eliminatoria.ativa = false;
  const compiled = F.compileToPhases(cfg, { sport });
  return JSON.parse(JSON.stringify({
    sport, ...compiled.topLevel, phases: compiled.phases,
    // A tradução só atesta documentos que trazem estes campos explicitamente.
    gruposClassified: compiled.topLevel.gruposClassified,
    gruposCount: compiled.topLevel.gruposCount
  }));
}
function directEliminationFixture() {
  const sport = 'Beach Tennis';
  const cfg = F.defaultConfig(sport);
  cfg.classifAtiva = false;
  cfg.eliminatoria.ativa = true;
  const compiled = F.compileToPhases(cfg, { sport });
  return JSON.parse(JSON.stringify({ sport, ...compiled.topLevel, phases: compiled.phases }));
}
function directHistoricalSinglesFixture(sport) {
  const cfg = F.defaultConfig(sport);
  cfg.disputa = 'individual';
  cfg.historicalSinglesOverride = true;
  cfg.classifAtiva = false;
  cfg.eliminatoria.ativa = true;
  const compiled = F.compileToPhases(cfg, { sport });
  return JSON.parse(JSON.stringify({ sport, ...compiled.topLevel, phases: compiled.phases }));
}
function checkPure(t) {
  const before = structuredClone(t);
  const result = F.translateLegacyTournament(t);
  assert.deepEqual(t, before, 'entrada inteira permanece intocada, inclusive fases aninhadas');
  assert.deepEqual(F.translateLegacyTournament(t), result, 'resultado determinístico');
  return result;
}

const duo = fixture('Beach Tennis', 2);
const duoResult = checkPure(duo);
assert.equal(duoResult.ok, true, duoResult.reason);
assert.equal(duoResult.derived.topLevel.teamSize, 2);
assert.equal(duoResult.fmt2.historicalSinglesOverride, undefined);
const direct = directEliminationFixture();
assert.equal(direct.gruposCount, undefined);
assert.equal(direct.gruposClassified, undefined);
assert.equal(checkPure(direct).ok, true, checkPure(direct).reason);
const directHalf = structuredClone(direct);
directHalf.gruposCount = 1;
assert.equal(checkPure(directHalf).reason, 'unverified-gruposClassified');
const directWithGroups = structuredClone(direct);
directWithGroups.gruposCount = 1;
directWithGroups.gruposClassified = 2;
assert.equal(checkPure(directWithGroups).ok, false);
const directWithoutKind = structuredClone(direct);
delete directWithoutKind.phases[0].kind;
assert.equal(checkPure(directWithoutKind).ok, false);
const directWrongKind = structuredClone(direct);
directWrongKind.phases[0].kind = 'classification';
assert.equal(checkPure(directWrongKind).ok, false);

// Shapes medidos nos 69 torneios antigos de eliminação direta: contagens de
// grupos ausentes no topo e nulas (66) ou 4/2 (3) apenas na fase.
const { _window: drawWindow } = require('../functions-autodraw/draw-core.js');
for (const phaseCounts of [null, [4, 2]]) {
  const old = structuredClone(direct);
  delete old.drawMode;
  delete old.politicaDaChave;
  old.phases[0].gruposCount = phaseCounts ? phaseCounts[0] : null;
  old.phases[0].gruposClassified = phaseCounts ? phaseCounts[1] : null;
  old.phases[0].drawMode = phaseCounts ? 'sorteio' : null;
  old.phases[0].politicaDaChave = null;
  const translated = checkPure(old);
  assert.equal(translated.ok, true, translated.reason);
  const updated = { ...old, ...translated.derived.topLevel, phases: translated.derived.phases, fmt2: translated.fmt2 };
  const beforeCfg = drawWindow._buildPhase0Cfg(old);
  const afterCfg = drawWindow._buildPhase0Cfg(updated);
  assert.equal(beforeCfg.formatCode, 'elim_simples');
  assert.equal(afterCfg.formatCode, 'elim_simples');
  assert.equal(beforeCfg.drawMode, 'sorteio');
  assert.equal(afterCfg.drawMode, 'sorteio');
  beforeCfg.politicaDaChave ||= 'repescagem';
  assert.deepEqual(beforeCfg, afterCfg, 'sorteio inicial mantém configuração efetiva');
  assert.deepEqual(drawWindow._chaves.plano(9, 'simples', null),
    drawWindow._chaves.plano(9, 'simples', 'repescagem'));

  const wrongPhaseCount = structuredClone(old);
  wrongPhaseCount.phases[0].gruposCount = 3;
  assert.equal(checkPure(wrongPhaseCount).ok, false);
  const wrongPhaseClassified = structuredClone(old);
  wrongPhaseClassified.phases[0].gruposClassified = 3;
  assert.equal(checkPure(wrongPhaseClassified).ok, false);
  for (const level of ['top', 'phase']) {
    for (const [key, value] of [['drawMode', 'rei_rainha'], ['politicaDaChave', 'bye']]) {
      const wrong = structuredClone(old);
      (level === 'top' ? wrong : wrong.phases[0])[key] = value;
      assert.equal(checkPure(wrong).ok, false, level + '.' + key);
    }
  }
}
const directWithNullTopCount = structuredClone(direct);
directWithNullTopCount.gruposCount = null;
directWithNullTopCount.gruposClassified = null;
directWithNullTopCount.phases[0].gruposCount = 3;
directWithNullTopCount.phases[0].gruposClassified = 3;
assert.equal(checkPure(directWithNullTopCount).ok, false);
const directWithTopDefaults = structuredClone(direct);
directWithTopDefaults.gruposCount = 4;
directWithTopDefaults.gruposClassified = 2;
const alreadyCounted = checkPure(directWithTopDefaults);
assert.equal(alreadyCounted.ok, false, 'topo 4/2 continua fora da equivalência restrita');
const directStringDuo = structuredClone(direct);
directStringDuo.teamSize = '2';
directStringDuo.phases[0].gruposCount = null;
directStringDuo.phases[0].gruposClassified = null;
assert.equal(checkPure(directStringDuo).ok, true);

const tennis = fixture('Tênis', 1);
const tennisResult = checkPure(tennis);
assert.equal(tennisResult.ok, true, tennisResult.reason);
assert.equal(tennisResult.derived.topLevel.teamSize, 1);
assert.equal(tennisResult.fmt2.historicalSinglesOverride, undefined);
const tennisString = structuredClone(tennis);
tennisString.teamSize = '1';
const tennisStringResult = checkPure(tennisString);
assert.equal(tennisStringResult.ok, true);
assert.deepEqual(tennisStringResult.fmt2, tennisResult.fmt2);
assert.deepEqual(tennisStringResult.derived, tennisResult.derived);
const duoString = structuredClone(duo);
duoString.teamSize = '2';
const duoStringResult = checkPure(duoString);
assert.equal(duoStringResult.ok, true);
assert.deepEqual(duoStringResult.fmt2, duoResult.fmt2);
assert.deepEqual(duoStringResult.derived, duoResult.derived);
assert.equal(duo.resultEntry, undefined);
assert.equal(duo.lateEnrollment, undefined);
assert.equal(duo.newMatchups, undefined);

for (const sport of ['Futevôlei', 'Vôlei de Praia']) {
  for (const phaseCounts of [null, [4, 2]]) {
    const old = directHistoricalSinglesFixture(sport);
    delete old.drawMode;
    delete old.politicaDaChave;
    old.phases[0].gruposCount = phaseCounts ? phaseCounts[0] : null;
    old.phases[0].gruposClassified = phaseCounts ? phaseCounts[1] : null;
    old.phases[0].drawMode = phaseCounts ? 'sorteio' : null;
    old.phases[0].politicaDaChave = null;
    const translated = checkPure(old);
    assert.equal(translated.ok, true, sport + ': ' + translated.reason);
    assert.equal(translated.fmt2.historicalSinglesOverride, true);
    assert.equal(translated.derived.topLevel.teamSize, 1);
    assert.equal(typeof translated.derived.topLevel.teamSize, 'number');
    const reopened = { ...old, ...translated.derived.topLevel, phases: translated.derived.phases, fmt2: translated.fmt2 };
    const formMountClone = JSON.parse(JSON.stringify(reopened.fmt2));
    const formPayload = F.normalize(formMountClone, sport);
    assert.equal(formPayload.historicalSinglesOverride, true, 'ficha preserva flag no mount/get/save');
    assert.equal(typeof F.compileToPhases(formPayload, { sport }).topLevel.teamSize, 'number');
    const twice = F.normalize(F.configFromTournament(reopened, sport), sport);
    assert.equal(twice.historicalSinglesOverride, true);
    assert.equal(twice.disputa, 'individual');
    assert.equal(F.compileToPhases(twice, { sport }).topLevel.teamSize, 1);
    assert.equal(F.normalize({ disputa: 'individual' }, sport).disputa, 'dupla');
  }
}

for (const size of [undefined, null, 3, 'abc', ' 1', '2.0', true]) {
  const sample = structuredClone(duo);
  if (size === undefined) delete sample.teamSize;
  else sample.teamSize = size;
  assert.equal(checkPure(sample).reason, 'invalid-teamSize');
}
const missingSport = structuredClone(duo);
delete missingSport.sport;
assert.equal(checkPure(missingSport).reason, 'missing-sport');
for (const size of [1, '1']) {
  const sample = structuredClone(duo);
  sample.teamSize = size;
  assert.equal(checkPure(sample).ok, false, 'dupla antiga não se torna individual por trocar tamanho no topo');
}
const tennisDuo = structuredClone(tennis);
tennisDuo.teamSize = 2;
assert.equal(checkPure(tennisDuo).reason, 'doubles-not-supported-for-sport');
const mixed = structuredClone(duo);
mixed.enrollmentMode = 'misto';
assert.equal(checkPure(mixed).reason, 'mixed-enrollment-not-representable');

// Estado terminal medido em produção: uma única fase classificatória mista,
// embora o rótulo histórico mencione eliminatórias não materializadas.
const completedMixedCfg = F.defaultConfig('Futevôlei');
completedMixedCfg.disputa = 'dupla';
completedMixedCfg.parceria = 'fixa';
completedMixedCfg.classifAtiva = true;
completedMixedCfg.grupos = 2;
completedMixedCfg.classificados = 4;
completedMixedCfg.eliminatoria.ativa = false;
completedMixedCfg.completedMixedGroupOnly = true;
const completedMixedCompiled = F.compileToPhases(completedMixedCfg, { sport: 'Futevôlei' });
const completedMixed = JSON.parse(JSON.stringify({
  sport: 'Futevôlei', status: 'finished', matches: [],
  ...completedMixedCompiled.topLevel, phases: completedMixedCompiled.phases
}));
assert.equal(completedMixed.phases.length, 1);
const completedMixedResult = checkPure(completedMixed);
assert.equal(completedMixedResult.ok, true, completedMixedResult.reason);
assert.equal(completedMixedResult.fmt2.completedMixedGroupOnly, true);
for (const [key, expected] of [
  ['format', 'Fase de Grupos + Eliminatórias'], ['enrollmentMode', 'misto'],
  ['gruposCount', 2], ['gruposClassified', 4], ['teamSize', 2],
  ['drawMode', 'sorteio'], ['manualPairing', 'open'], ['mixedPairingSeparated', false]
]) assert.equal(completedMixedResult.derived.topLevel[key], expected, 'top.' + key);
for (const [key, expected] of [
  ['format', 'Fase de Grupos + Eliminatórias'], ['gruposCount', 2],
  ['gruposClassified', 4], ['formatCode', 'classification_groups'],
  ['fixedPairs', true], ['drawMode', 'sorteio']
]) assert.equal(completedMixedResult.derived.phases[0][key], expected, 'phase.' + key);
const completedMixedReopened = { ...completedMixed,
  ...completedMixedResult.derived.topLevel,
  phases: completedMixedResult.derived.phases, fmt2: completedMixedResult.fmt2 };
const completedMixedEditor = F.normalize(JSON.parse(JSON.stringify(completedMixedReopened.fmt2)), 'Futevôlei');
assert.equal(completedMixedEditor.completedMixedGroupOnly, true, 'mount/get/save preserva marcador');
assert.equal(F.configFromTournament(completedMixedReopened, 'Futevôlei').completedMixedGroupOnly, true);
const completedMixedTwice = F.compileToPhases(completedMixedEditor, { sport: 'Futevôlei' });
assert.deepEqual(JSON.parse(JSON.stringify(completedMixedTwice.topLevel)),
  JSON.parse(JSON.stringify(completedMixedResult.derived.topLevel)));
assert.deepEqual(JSON.parse(JSON.stringify(completedMixedTwice.phases)),
  JSON.parse(JSON.stringify(completedMixedResult.derived.phases)));
assert.deepEqual(drawWindow._buildPhase0Cfg(completedMixed),
  drawWindow._buildPhase0Cfg(completedMixedReopened), 'configuração efetiva do sorteio idêntica');
for (const [scope, key, value] of [
  ['top', 'status', 'active'], ['top', 'teamSize', 1], ['top', 'gruposCount', 3],
  ['top', 'gruposClassified', 2], ['top', 'mixedPairingSeparated', true],
  ['top', 'politicaDaChave', 'bye'],
  ['top', 'manualPairing', 'organizer_only'], ['phase', 'gruposCount', 4],
  ['phase', 'gruposClassified', 2], ['phase', 'fixedPairs', false]
]) {
  const wrong = structuredClone(completedMixed);
  (scope === 'top' ? wrong : wrong.phases[0])[key] = value;
  assert.equal(checkPure(wrong).ok, false, scope + '.' + key);
}
const completedMixedWithElimination = structuredClone(completedMixed);
completedMixedWithElimination.phases.push({ kind: 'elimination', formatCode: 'elim_simples' });
assert.equal(checkPure(completedMixedWithElimination).ok, false);

for (const key of ['format', 'enrollmentMode', 'gruposClassified', 'gruposCount', 'phases']) {
  const sample = structuredClone(duo);
  delete sample[key];
  assert.equal(checkPure(sample).reason, key === 'gruposCount' ? 'unverified-gruposClassified' : 'unverified-' + key);
}
for (const [key, value] of [['format', 'Ranking'], ['enrollmentMode', 'teams'], ['gruposClassified', 999]]) {
  const sample = structuredClone(duo);
  sample[key] = value;
  assert.equal(checkPure(sample).reason, 'mismatch-top.' + key);
}
const nested = structuredClone(duo);
nested.phases[0].classification.structure = 'unknown';
nested.swissRoundsData = [{ round: 1, results: [1, 2] }];
nested.p2Resolution = 'none';
assert.equal(checkPure(nested).ok, false);
const malformed = structuredClone(duo);
malformed.phases = [null];
assert.equal(checkPure(malformed).ok, false);

console.log('format2-legacy-translation: OK');

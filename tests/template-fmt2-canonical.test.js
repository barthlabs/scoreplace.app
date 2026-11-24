'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const create = fs.readFileSync(path.join(root, 'js/views/create-tournament.js'), 'utf8');
const organizer = fs.readFileSync(path.join(root, 'js/views/tournaments-organizer.js'), 'utf8');
const start = create.indexOf('window._f2TemplateCopy = function(');
const end = create.indexOf('// ─── Pre-fill form from a saved template', start);
assert(start >= 0 && end > start, 'helper real localizado');
const W = {};
vm.runInNewContext(create.slice(start, end), { window: W });
const copy = W._f2TemplateCopy;
assert.strictEqual(copy(null), null);
assert.strictEqual(copy(undefined), null);
assert.strictEqual(copy([]), null);
// Um modelo com regra curta precisa repor o scoring, além do formato da chave.
const writeStart = create.indexOf('window._writeScoringToForm = function(');
const writeEnd = create.indexOf('\n  };', writeStart);
assert(writeStart >= 0 && writeEnd > writeStart);
const scoreInputs = Object.fromEntries(['type', 'setsToWin', 'gamesPerSet', 'tiebreakEnabled',
  'tiebreakAt', 'tieRule', 'countingType'].map(key => ['gsm-' + key, { value: '' }]));
const scoreWindow = {};
vm.runInNewContext(create.slice(writeStart, writeEnd + 5), {
  window: scoreWindow, document: { getElementById: id => scoreInputs[id] || null }
});
scoreWindow._writeScoringToForm({ type: 'sets', setsToWin: 1, gamesPerSet: 4,
  tiebreakEnabled: false, tiebreakAt: 'g-1', tieRule: 'decider', countingType: 'tennis' });
assert.strictEqual(scoreInputs['gsm-gamesPerSet'].value, '4');
assert.strictEqual(scoreInputs['gsm-tieRule'].value, 'decider');
assert(create.includes("if (tpl.scoring && typeof window._writeScoringToForm === 'function')"));
assert(create.includes('var scoring = window._gsmReadHidden();'));

// Mesmo objeto que o formulário grava: _f2GetConfig() = FORMAT2.normalize(...).
const f2Source = fs.readFileSync(path.join(root, 'js/views/format2.js'), 'utf8');
const formatWindow = { ScoreplaceTeamCompetition: require('../js/domain/team-competition.js') };
vm.runInNewContext(f2Source, { window: formatWindow, console });
const config = formatWindow.FORMAT2.defaultConfig('Beach Tennis');
config.parceria = 'rei_rainha';
config.rodadas.drawFirstDate = '2026-10-01';
config.rodadas.drawFirstTime = '20:30';
config.rodadas.drawIntervalDays = 3;
config.eliminatoria.politicaDaChave = 'sobra_unica';
config.eliminatoria.nome = 'Finals';
config.eliminatoria.endDate = '2026-10-31';
config.eliminatoria.endTime = '23:00';
config.eliminatoria.roundBounds = ['2026-10-20T23:00'];
config.eliminatoria.roundBoundsEditorEnabled = true;
config.rodadas.matches = [{ id: 'match-from-old-tournament' }];
config.eliminatoria.participants = ['uid-from-old-tournament'];
const original = JSON.stringify(config);
const savedByOldForm = formatWindow.FORMAT2.normalize(config, 'Beach Tennis');
const copied = copy(savedByOldForm);
assert.strictEqual(copied.eliminatoria.nome, 'Finals', 'template preserva nome livre da eliminatória');
for (const [label, source, target, transient] of [
  ['fmt2', savedByOldForm, copied, []],
  ['rodadas', savedByOldForm.rodadas, copied.rodadas, ['matches']],
  ['eliminatoria', savedByOldForm.eliminatoria, copied.eliminatoria, ['participants']],
  ['teamCompetition', savedByOldForm.teamCompetition, copied.teamCompetition, []]
]) {
  assert.deepStrictEqual(Object.keys(source).filter(key => !transient.includes(key) &&
    !Object.prototype.hasOwnProperty.call(target, key)), [],
    `${label}: template preserva todas as escolhas de formato`);
}
const choices = formatWindow.FORMAT2.defaultConfig('Beach Tennis');
choices.rankingRemainderPolicy = 'waitlist_legacy';
choices.rankingSitOutScoring = { mode: 'fixed', points: 7 };
choices.tieResolution = 'singles_then_draw';
choices.tieSinglesPoints = 7;
choices.tieSinglesMargin = 2;
choices.eliminatoria.finalSeriesBestOf = 7;
choices.eliminatoria.semeadura = 'sorteio';
choices.eliminatoria.grandFinalReset = true;
choices.eliminatoria.lineAssignment = 'rank_ranges';
choices.eliminatoria.lineRankRanges = [{ from: 1, to: 4 }, { from: 5, to: 8 }];
choices.eliminatoria.bestNextByGroup = { count: 1, metric: 'win_rate', destIndex: 1 };
const replay = copy(choices);
for (const key of ['rankingRemainderPolicy', 'rankingSitOutScoring', 'tieResolution', 'tieSinglesPoints', 'tieSinglesMargin'])
  assert.strictEqual(JSON.stringify(replay[key]), JSON.stringify(choices[key]), `template preserva ${key}`);
for (const key of ['finalSeriesBestOf', 'semeadura', 'grandFinalReset', 'lineAssignment', 'lineRankRanges', 'bestNextByGroup'])
  assert.strictEqual(JSON.stringify(replay.eliminatoria[key]), JSON.stringify(choices.eliminatoria[key]), `template preserva eliminatoria.${key}`);
const replayedRules = formatWindow.FORMAT2.normalize(replay, 'Beach Tennis');
const replayedPhases = formatWindow.FORMAT2.compileToPhases(replayedRules, { sport: 'Beach Tennis' }).phases;
assert.strictEqual(replayedRules.tieResolution, 'singles_then_draw');
assert.strictEqual(replayedRules.rankingSitOutScoring.points, 7);
assert.strictEqual(replayedPhases[0].rankingSitOutScoring.points, 7);
assert.strictEqual(replayedPhases[replayedPhases.length - 1].finalSeriesBestOf, 7);
assert.strictEqual(replayedRules.eliminatoria.grandFinalReset, false,
  'série longa desliga o reset incompatível após copiar o template');
const resetChoice = formatWindow.FORMAT2.defaultConfig('Beach Tennis');
resetChoice.eliminatoria.grandFinalReset = true;
assert.strictEqual(formatWindow.FORMAT2.normalize(copy(resetChoice), 'Beach Tennis').eliminatoria.grandFinalReset,
  true, 'final de uma partida preserva o reset permitido');
const shortSet = formatWindow.FORMAT2.defaultConfig('Beach Tennis');
shortSet.eliminatoria.scoring = { type: 'sets', setsToWin: 1, gamesPerSet: 4,
  tiebreakAt: 'g-1', tieRule: 'decider', tiebreakEnabled: false, countingType: 'tennis' };
const shortSetNormalized = formatWindow.FORMAT2.normalize(shortSet, 'Beach Tennis');
assert.strictEqual(shortSetNormalized.eliminatoria.scoring.tieRule, 'decider',
  'a regra da eliminatória sobrevive à normalização');
assert.strictEqual(copied.rodadas.drawFirstDate, '');
assert.strictEqual(copied.rodadas.drawFirstTime, '20:30');
assert.strictEqual(copied.rodadas.drawIntervalDays, 3);
assert.strictEqual(copied.eliminatoria.endDate, '');
assert.strictEqual(copied.eliminatoria.endTime, '');
assert.strictEqual(copied.eliminatoria.roundBounds.length, 0);
assert.strictEqual(copied.eliminatoria.roundBoundsEditorEnabled, true);
assert.strictEqual(copied.eliminatoria.politicaDaChave, 'sobra_unica');
assert(!Object.prototype.hasOwnProperty.call(copied.rodadas, 'matches'));
assert(!Object.prototype.hasOwnProperty.call(copied.eliminatoria, 'participants'));
assert.strictEqual(JSON.stringify(config), original, 'origem não mutada');
const normalizedAgain = formatWindow.FORMAT2.normalize(copied, 'Beach Tennis');
assert.strictEqual(normalizedAgain.rodadas.drawFirstDate, '');
assert.strictEqual(normalizedAgain.eliminatoria.endDate, '');

const team = formatWindow.FORMAT2.defaultConfig('Beach Tennis');
team.parceria = 'fixa';
team.teamCompetition = {
  enabled: true, teamNames: ['Azul', 'Vermelho'], teamCount: 2,
  tieDrawOrder: ['team-old-id'],
  schedule: {
    enabled: true, teamsPerGroup: 2, gamesPerPair: 1,
    pairDayAssignments: [{ fixedPairId: 'old-pair', day: '2026-10-22' }],
    rosterSnapshot: [{ fixedPairId: 'old-pair', categoryId: 'old-category' }],
    mode: 'structured', modeChosen: true
  }
};
const teamCopy = copy(formatWindow.FORMAT2.normalize(team, 'Beach Tennis'));
assert(!Object.prototype.hasOwnProperty.call(teamCopy.teamCompetition, 'tieDrawOrder'));
assert(!Object.prototype.hasOwnProperty.call(teamCopy.teamCompetition.schedule, 'pairDayAssignments'));
assert(!Object.prototype.hasOwnProperty.call(teamCopy.teamCompetition.schedule, 'rosterSnapshot'));
assert.strictEqual(teamCopy.teamCompetition.teamNames[0], 'Azul');
const teamReloaded = formatWindow.FORMAT2.normalize(teamCopy, 'Beach Tennis');
assert.strictEqual(teamReloaded.teamCompetition.schedule.pairDayAssignments.length, 0);
assert.strictEqual(teamReloaded.teamCompetition.schedule.rosterSnapshot.length, 0);

// Os produtores e o loader devem obrigatoriamente usar a mesma projeção.
assert(create.includes('window._f2PendingTemplateCfg = window._f2TemplateCopy(tpl.fmt2)'));
assert(create.includes('fmt2: fmt2,'));
assert(create.includes('var fmt2 = window._f2TemplateCopy') || create.includes('fmt2 = window._f2TemplateCopy'));
assert(organizer.includes('window._f2TemplateCopy(t.fmt2)'));
assert(organizer.includes('if (!template.fmt2) delete template.fmt2'));
assert.strictEqual(copy(null), null, 'torneio antigo sem fmt2 não fabrica configuração');

function functionBlock(source, beginning, ending) {
  const from = source.indexOf(beginning);
  const to = source.indexOf(ending, from);
  assert(from >= 0 && to > from, 'bloco real localizado: ' + beginning);
  return source.slice(from, to);
}

async function integration() {
  // Loader real: um template já salvo pelo formulário antigo continha datas.
  const loadWindow = { _f2TemplateCopy: copy, _blankTournamentDates: () => {},
    _f2MountInEditForm: () => {} };
  const loadContext = { window: loadWindow, document: {
    getElementById: () => null, querySelectorAll: () => []
  }, Array, Object, JSON };
  vm.runInNewContext(functionBlock(create, 'window._prefillFromTemplate = function(tpl)',
    '// ─── Discard create/edit tournament'), loadContext);
  loadWindow._prefillFromTemplate({ fmt2: savedByOldForm });
  assert.strictEqual(loadWindow._f2PendingTemplateCfg.rodadas.drawFirstDate, '');
  assert.strictEqual(loadWindow._f2PendingTemplateCfg.eliminatoria.roundBounds.length, 0);
  loadWindow._f2PendingTemplateCfg = undefined;
  loadWindow._prefillFromTemplate({ format: 'Liga' });
  assert.strictEqual(loadWindow._f2PendingTemplateCfg, undefined, 'template sem fmt2 não fabrica configuração');

  // Producer real do organizer: nem legados nem templates canônicos gravam torneios.
  const saved = [];
  const orgWindow = {
    _f2TemplateCopy: copy,
    _t: key => key,
    _saveTemplate: async tpl => { saved.push(tpl); return 'ok'; },
    AppStore: { tournaments: [{ id: 'old', name: 'Antigo', format: 'Liga' },
      { id: 'new', name: 'Novo', format: 'Liga', fmt2: savedByOldForm,
        gruposCount: 99, gruposClassified: 99 }] }
  };
  const orgContext = { window: orgWindow, showInputDialog: (label, name, cb) => cb(name),
    showNotification: () => {}, FirestoreDB: { saveTournament: () => { throw Error('não pode gravar torneio'); } } };
  vm.runInNewContext(functionBlock(organizer, 'window._saveAsTemplate = function(tId)',
    '// ─── REABRIR TORNEIO ENCERRADO'), orgContext);
  orgWindow._saveAsTemplate('old');
  orgWindow._saveAsTemplate('new');
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(saved.length, 2);
  assert(!Object.prototype.hasOwnProperty.call(saved[0], 'fmt2'));
  assert.strictEqual(saved[1].gruposCount, copied.grupos);
  assert.strictEqual(saved[1].gruposClassified, copied.classificados);
  assert.strictEqual(saved[1].fmt2.rodadas.drawFirstDate, '');
  assert.strictEqual(saved[1].fmt2.eliminatoria.endDate, '');

  // O botão da ficha é montado junto ao configurador canônico. Se ele não
  // iniciou (modo diferente de form), bloquear é mais seguro que salvar legado.
  assert(create.includes("if (typeof window._f2MountInEditForm === 'function') { try { window._f2MountInEditForm(); } catch (e) {} }"));
  let alerted = false, dialogOpened = false;
  const formWindow = {
    AppStore: { currentUser: { uid: 'owner' } },
    _f2TemplateCopy: copy,
    _f2GetConfig: () => null
  };
  const formContext = { window: formWindow,
    document: { getElementById: () => null },
    showNotification: () => { alerted = true; },
    showInputDialog: () => { dialogOpened = true; } };
  vm.runInNewContext(functionBlock(create, 'window._saveCurrentFormAsTemplate = function(saveButton)',
    '// ─── Template picker inside create-tournament modal'), formContext);
  formWindow._saveCurrentFormAsTemplate();
  assert(alerted && !dialogOpened, 'fmt2 ausente bloqueia o save, sem fabricar template antigo');

  let formSaved;
  formWindow._f2GetConfig = () => savedByOldForm;
  formWindow._readTournamentDateColors = () => ({ background:'#216b96', text:'#ffffff', day:'#ffffff', month:'#ffc400', time:'#e5f4fc' });
  formWindow._allowSelfDeactEl = () => null;
  formWindow._gsmReadHidden = () => ({ type:'sets', gamesPerSet:4,
    tiebreakAt:'g-1', tieRule:'decider', tiebreakEnabled:false, countingType:'tennis' });
  formWindow._saveTemplate = async tpl => { formSaved = tpl; return 'ok'; };
  formContext.showInputDialog = (label, name, cb) => cb('Modelo novo');
  formWindow._saveCurrentFormAsTemplate();
  await new Promise(resolve => setImmediate(resolve));
  assert(formSaved && formSaved.fmt2, 'formulário salva configuração canônica');
  assert.strictEqual(formSaved.scoring.gamesPerSet, 4);
  assert.strictEqual(formSaved.scoring.tieRule, 'decider');
  assert.strictEqual(formSaved.dateCardColors.month, '#ffc400', 'modelo preserva as cores da data');
  assert.strictEqual(formSaved.fmt2.rodadas.drawFirstDate, '');
  assert.strictEqual(formSaved.fmt2.eliminatoria.endDate, '');
}

// Atalhos dos modelos aparecem logo após o nome e reutilizam a ação de aplicar.
const nameField = create.indexOf('id="tourn-name"');
const shortcutHost = create.indexOf('id="tournament-template-shortcuts"');
const testModeRow = create.indexOf('id="tourn-test-mode-row"');
const sportField = create.indexOf('id="select-sport"');
assert(nameField >= 0 && nameField < shortcutHost && shortcutHost < testModeRow && testModeRow < sportField,
  'atalhos ficam imediatamente abaixo do nome');
const host = { style: {}, innerHTML: '' };
const shortcutWindow = {
  _templateCache: [{ name: 'Super 8' }, { name: '<Outro>' }],
  _getTemplates() { return this._templateCache; },
  _safeHtml(s) { return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
};
vm.runInNewContext(functionBlock(create, 'window._renderTemplateShortcuts = function()',
  'window._showTemplatePickerInCreate = function()'), {
  window: shortcutWindow,
  document: { getElementById: id => id === 'tournament-template-shortcuts' ? host : null }
});
shortcutWindow._renderTemplateShortcuts();
assert.strictEqual(host.style.display, 'flex');
assert(host.innerHTML.includes('_applyTemplateInCreate(0)') && host.innerHTML.includes('_applyTemplateInCreate(1)'),
  'cada botão aplica seu modelo existente');
assert(host.innerHTML.includes('&lt;Outro&gt;'), 'nomes dos modelos são escapados');

const groupedTemplate = JSON.parse(JSON.stringify(copy({
  groupFormation:{mode:'size',value:8,matches:['discard']},
  groupCategoryRules:[{category:'A',groupFormation:{mode:'count',value:1,participants:['discard']},gamesPerUnit:14,allowRepeat:true,results:['discard']}],
  rotationCategoryRules:[{category:'A',rounds:7,destination:'ranking',matches:['discard']}],
  rotationAllowRepeatPartners:true, classificationSchedule:{gamesPerUnit:14,mode:'structured',allowRepeat:true},
  matches:['discard'],results:['discard'],participants:['discard']
})));
assert.deepStrictEqual(groupedTemplate, {
  groupFormation:{mode:'size',value:8},
  groupCategoryRules:[{category:'A',gamesPerUnit:14,allowRepeat:true,groupFormation:{mode:'count',value:1}}],
  rotationCategoryRules:[{category:'A',rounds:7,destination:'ranking'}],
  rotationAllowRepeatPartners:true,classificationSchedule:{gamesPerUnit:14,mode:'structured',allowRepeat:true}
});

integration().then(() => console.log('template-fmt2-canonical: ok'))
  .catch(err => { console.error(err); process.exitCode = 1; });

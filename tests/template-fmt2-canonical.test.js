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
config.eliminatoria.endDate = '2026-10-31';
config.eliminatoria.endTime = '23:00';
config.eliminatoria.roundBounds = ['2026-10-20T23:00'];
config.eliminatoria.roundBoundsEditorEnabled = true;
config.rodadas.matches = [{ id: 'match-from-old-tournament' }];
config.eliminatoria.participants = ['uid-from-old-tournament'];
const original = JSON.stringify(config);
const savedByOldForm = formatWindow.FORMAT2.normalize(config, 'Beach Tennis');
const copied = copy(savedByOldForm);
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
  formWindow._allowSelfDeactEl = () => null;
  formWindow._saveTemplate = async tpl => { formSaved = tpl; return 'ok'; };
  formContext.showInputDialog = (label, name, cb) => cb('Modelo novo');
  formWindow._saveCurrentFormAsTemplate();
  await new Promise(resolve => setImmediate(resolve));
  assert(formSaved && formSaved.fmt2, 'formulário salva configuração canônica');
  assert.strictEqual(formSaved.fmt2.rodadas.drawFirstDate, '');
  assert.strictEqual(formSaved.fmt2.eliminatoria.endDate, '');
}

integration().then(() => console.log('template-fmt2-canonical: ok'))
  .catch(err => { console.error(err); process.exitCode = 1; });

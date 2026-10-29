'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const tournamentId = 'tour_test_categories';
const oldDefinitions = [{ id: 'b', label: 'B', enabled: true }];
const newDefinitions = [{ id: 'retinal', label: 'Retinal', enabled: true }];
let rosterReads = 0;
const window = {
  AppStore: { tournaments: [] },
  FirestoreDB: {
    loadCanonicalTournamentRoster: async () => {
      rosterReads++;
      return { participants: [], placeholderReservations: [], categoryDefinitions: oldDefinitions };
    }
  },
  location: { hash: '#analise/' + tournamentId, replace() {} },
  _souOrganizador: () => true,
  _log() {}, _error() {},
  _filterBarState: { analise: {} },
  _renderBackHeader: () => '',
  _getTournamentCategories: (t) => (t.categoryDefinitions || []).map((d) => d.label)
};
const container = { innerHTML: '', querySelector: () => null };
const document = { getElementById: () => null };
const context = { window, document, console, Promise, setTimeout, clearTimeout };
const source = fs.readFileSync(path.join(__dirname, '../js/views/tournaments-enrollment-report.js'), 'utf8');
vm.runInNewContext(source, context, { filename: 'tournaments-enrollment-report.js' });

async function settle() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }

(async () => {
  const oldTournament = { id: tournamentId, categoryDefinitions: oldDefinitions,
    canonicalRegistrationMigration: { fingerprint: 'test' }, participants: [] };
  window.AppStore.tournaments = [oldTournament];
  window.renderEnrollmentReportPage(container, tournamentId);
  await settle();
  assert.equal(rosterReads, 1, 'o elenco é carregado uma única vez');

  const updatedTournament = { id: tournamentId, categoryDefinitions: newDefinitions,
    canonicalRegistrationMigration: { fingerprint: 'test' }, participants: [] };
  window.AppStore.tournaments = [updatedTournament];
  window.renderEnrollmentReportPage(container, tournamentId, true);
  assert.equal(updatedTournament.categoryDefinitions[0].label, 'Retinal',
    'a cópia do elenco não pode recolocar B sobre a configuração atual');
  assert.deepEqual(window._getTournamentCategories(updatedTournament), ['Retinal']);
  assert.equal(rosterReads, 1, 'a categoria vigente não depende de refazer a leitura do elenco');

  const missingDefinitions = { id: tournamentId,
    canonicalRegistrationMigration: { fingerprint: 'test' }, participants: [] };
  window.AppStore.tournaments = [missingDefinitions];
  window.renderEnrollmentReportPage(container, tournamentId, true);
  assert.equal(missingDefinitions.categoryDefinitions[0].label, 'B',
    'as definições da callable suprem somente um documento sem definições');

  const emptyDefinitions = { id: tournamentId, categoryDefinitions: [],
    canonicalRegistrationMigration: { fingerprint: 'test' }, participants: [] };
  window.AppStore.tournaments = [emptyDefinitions];
  window.renderEnrollmentReportPage(container, tournamentId, true);
  assert.equal(emptyDefinitions.categoryDefinitions.length, 0,
    'array vazio explícito não pode ser substituído pelo cache');
  console.log('✓ relatório preserva categorias vigentes e usa cache só quando ausentes');
})().catch((error) => { console.error(error); process.exitCode = 1; });

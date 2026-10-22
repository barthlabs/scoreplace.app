'use strict';
const assert = require('assert/strict');
const { findReleaseBuild, storeNotes, notesForLocalizations, selectCancelableSubmission } = require('../scripts/asc');

const makeBuild = (id, version, state = 'VALID') => ({
  type: 'builds', id,
  attributes: { version: id, processingState: state, expired: false },
  relationships: { preReleaseVersion: { data: { type: 'preReleaseVersions', id: version } } },
});
const makeVersion = (version) => ({ type: 'preReleaseVersions', id: version, attributes: { version } });

(async () => {
  const pages = [
    { data: [makeBuild('288', '2.5.18')], included: [makeVersion('2.5.18')], links: { next: 'https://example.test/page2' } },
    { data: [makeBuild('289', '2.5.29')], included: [makeVersion('2.5.29')], links: {} },
  ];
  let calls = 0;
  const getPage = async () => pages[calls++];
  const selected = await findReleaseBuild(getPage, 'app-id', '2.5.29', '289');
  assert.equal(selected.build.id, '289');
  assert.equal(calls, 2);
  await assert.rejects(() => findReleaseBuild(async () => ({ ...pages[0], links: {} }), 'app-id', '2.5.29', '288'), /encontrei 0/);
  await assert.rejects(() => findReleaseBuild(async () => ({
    data: [makeBuild('289', '2.5.29', 'PROCESSING')], included: [makeVersion('2.5.29')], links: {},
  }), 'app-id', '2.5.29', '289'), /ainda não está válida/);
  const notes = storeNotes();
  assert.match(notes['pt-BR'], /2\.5\.32/);
  assert.match(notes['en-US'], /2\.5\.32/);
  const localized = notesForLocalizations([
    { id: 'pt', attributes: { locale: 'pt-BR' } },
    { id: 'en', attributes: { locale: 'en-US' } },
  ], notes);
  assert.equal(localized[0].text, notes['pt-BR']);
  assert.equal(localized[1].text, notes['en-US']);
  assert.throws(() => notesForLocalizations([{ id: 'fr', attributes: { locale: 'fr-FR' } }], notes), /sem nota/);
  assert.throws(() => notesForLocalizations([{ id: 'en', attributes: { locale: 'en-US' } }], notes), /pt-BR ausente/);

  const review = (state = 'WAITING_FOR_REVIEW', versionId = 'version-id', count = 1) => ({
    id: 'review-id', attributes: { state },
    relationships: {
      appStoreVersionForReview: { data: { id: versionId } },
      items: { meta: { paging: { total: count } }, data: Array.from({ length: count }, (_, n) => ({ id: String(n) })) },
    },
  });
  assert.equal(selectCancelableSubmission([review()], 'version-id').id, 'review-id');
  assert.throws(() => selectCancelableSubmission([], 'version-id'), /encontrei 0/);
  assert.throws(() => selectCancelableSubmission([review(), review()], 'version-id'), /encontrei 2/);
  assert.throws(() => selectCancelableSubmission([review('IN_REVIEW')], 'version-id'), /não WAITING_FOR_REVIEW/);
  assert.throws(() => selectCancelableSubmission([review('WAITING_FOR_REVIEW', 'other')], 'version-id'), /não corresponde/);
  assert.throws(() => selectCancelableSubmission([review('WAITING_FOR_REVIEW', 'version-id', 2)], 'version-id'), /outros itens/);
  console.log('✓ App Store Connect exige versão, build e processamento exatos antes da submissão');
})().catch((error) => { console.error(error); process.exitCode = 1; });
